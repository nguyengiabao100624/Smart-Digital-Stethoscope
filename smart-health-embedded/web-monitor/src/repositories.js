const crypto = require("node:crypto");
const {
  canonicalDeviceSecretHash,
  normalizeDeviceSecretMaterial,
  sanitizeDeviceCredentialRotation,
  sanitizeDeviceTelemetry,
} = require("./deviceSessionSecurity");
const {
  applyDeviceOwnershipTransfer,
  applyDeviceOwnershipTransition,
  inferDeviceOwnershipState,
  validateActiveDeviceClaim,
} = require("./deviceOwnershipLifecycle");
const {
  claimDeviceClaim,
  loadDeviceClaimForUpdate,
  revokeOpenDeviceClaims,
} = require("./deviceOwnershipPersistence");
const { assertActiveManagedAdminWorkspace } = require("./managedAdminProvisioning");
const { createClinicalWorkflowRepository } = require("./clinicalWorkflowRepository");
const { createScanAudioUploadRepository } = require("./scanAudioUploadRepository");
const { createStorageMetadataRepository } = require("./storageMetadataRepository");
const { createStaffInvitationRepository } = require("./staffInvitationRepository");
const { createWorkspaceLifecycleRepository } = require("./workspaceLifecycleRepository");
const { normalizeWorkspaceCreate, publicWorkspaceLifecycle } = require("./workspaceLifecycleContract");
const { SIGNAL_QUALITY_ANALYZER_VERSION } = require("./aiRuntime");
const {
  normalizeServicePackageCreate,
  normalizeServicePackagePatch,
} = require("./servicePackageContract");
const {
  EXPORT_ARTIFACT_RENDERER_VERSION,
  EXPORT_SCOPE_KINDS,
  buildExportArtifact,
  normalizeExportFormat,
} = require("./exportArtifact");
const {
  filterAndPageAuditLogs,
  normalizeAuditLogQuery,
  sanitizeAuditMetadata,
} = require("./auditLogContract");

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

function sanitizeTwoFactorClaims(value = {}) {
  const claims = { ...objectOf(value) };
  delete claims.twoFactorSecret;
  delete claims.twoFactorSecretPreview;
  delete claims.twoFactorRecoveryCodes;
  const profile = { ...objectOf(claims.profile) };
  delete profile.twoFactorSecret;
  delete profile.twoFactorSecretPreview;
  delete profile.twoFactorRecoveryCodes;
  claims.profile = profile;
  return claims;
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
    notificationPreferences: objectOf(user.notificationPreferences),
    activePatientId: user.activePatientId || user.patientId || "",
  };
}

function firebaseClaimsForUser(user = {}) {
  const claims = sanitizeTwoFactorClaims(user.firebaseClaims);
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
  const firebaseClaims = sanitizeTwoFactorClaims(row.firebase_claims);
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
    notificationPreferences: objectOf(profile.notificationPreferences),
    activePatientId: typeof profile.activePatientId === "string" ? profile.activePatientId : row.patient_id || "",
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
  let requestedChannels = [];
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
  if (Array.isArray(row.requested_channels)) {
    requestedChannels = row.requested_channels;
  } else if (typeof row.requested_channels === "string") {
    try {
      const parsed = JSON.parse(row.requested_channels || "[]");
      requestedChannels = Array.isArray(parsed) ? parsed : [];
    } catch {
      requestedChannels = [];
    }
  }
  if (requestedChannels.length === 0) {
    requestedChannels = [row.channel || "in_app"];
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
    campaignId: row.campaign_id || "",
    audienceType: row.audience_type || "legacy",
    audienceRole: row.audience_role || "",
    requestedChannels,
    inAppStatus: row.in_app_status || (requestedChannels.includes("in_app") ? "ready" : "skipped"),
    emailStatus: row.email_status || "skipped",
    emailErrorMessage: row.email_error_message || "",
    pushStatus: row.push_status || "ready",
    pushSentAt: toIso(row.push_sent_at),
    pushFailedAt: toIso(row.push_failed_at),
    pushErrorMessage: row.push_error_message || "",
    pushAttempts,
    metadata: objectOf(row.metadata),
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
    workspaceType: row.workspace_type || row.type || "clinic",
    address: row.address || "",
    phone: row.phone || "",
    email: row.email || "",
    website: row.website || "",
    status: row.status || "active",
    legalName: row.legal_name || "",
    representative: row.representative || "",
    ownerUserId: row.owner_user_id || "",
    packageId: row.package_id || "",
    subscriptionStatus: row.subscription_status || "trial",
    billingCycle: row.billing_cycle || "monthly",
    requestMetadata: objectOf(row.request_metadata),
    version: Number(row.version || 1),
    deletedAt: toIso(row.deleted_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToServicePackage(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    type: row.type || "basic",
    segment: row.segment || "organization",
    price: Number(row.price || 0),
    currency: row.currency || "VND",
    duration: row.duration || "monthly",
    maxDevices: Number(row.max_devices || 0),
    maxDoctors: Number(row.max_doctors || 0),
    maxPatients: Number(row.max_patients || 0),
    storageGb: Number(row.storage_gb || 0),
    aiMonthly: Number(row.ai_monthly || 0),
    retentionDays: Number(row.retention_days || 0),
    features: objectOf(row.features),
    status: row.status || "active",
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
    status: row.status || "active",
    suspendedAt: toIso(row.suspended_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at) || toIso(row.created_at),
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
    dateOfBirth: toIso(row.date_of_birth).slice(0, 10),
    bloodType: row.blood_type || "",
    allergies: Array.isArray(row.allergies) ? row.allergies : [],
    emergencyContact: objectOf(row.emergency_contact),
    gender: row.gender || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
    notes: row.notes || "",
    guardianUserId: row.guardian_user_id || "",
    profileType: row.profile_type || (row.owner_user_id ? "dependent" : "patient"),
    relationship: row.relationship || "",
    familyGroupId: row.family_group_id || "",
    accountUserId: row.account_user_id || "",
    primaryDoctorId: row.primary_doctor_id || "",
    doctorName: row.doctor_name || "",
    deletedAt: toIso(row.deleted_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToPatientImportBatch(row) {
  if (!row) return null;
  const rows = Array.isArray(row.rows_json)
    ? row.rows_json
    : typeof row.rows_json === "string"
      ? JSON.parse(row.rows_json || "[]")
      : [];
  const patientIds = Array.isArray(row.patient_ids)
    ? row.patient_ids
    : typeof row.patient_ids === "string"
      ? JSON.parse(row.patient_ids || "[]")
      : [];
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    actorUserId: row.actor_user_id || "",
    fileName: row.file_name || "patients.csv",
    fileSizeBytes: Number(row.file_size_bytes || 0),
    fileSha256: row.file_sha256 || "",
    status: row.status || "invalid",
    rowCount: Number(row.row_count || 0),
    validCount: Number(row.valid_count || 0),
    invalidCount: Number(row.invalid_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    rows,
    patientIds,
    importedCount: Number(row.imported_count || 0),
    version: Number(row.version || 1),
    expiresAt: toIso(row.expires_at),
    committedAt: toIso(row.committed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToAuthSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || "",
    provider: "firebase",
    sessionKey: row.refresh_token_hash || "",
    tokenBindingHash: row.access_token_hash || "",
    device: row.device || "",
    ip: row.ip || "",
    revokedAt: toIso(row.revoked_at) || null,
    createdAt: toIso(row.created_at),
    lastSeenAt: toIso(row.last_seen_at),
  };
}

function rowToIdentityOperation(row) {
  if (!row) return null;
  return {
    id: row.id,
    targetUserId: row.target_user_id || "",
    actorUserId: row.actor_user_id || "",
    organizationId: row.organization_id || "",
    operation: row.operation || "",
    status: row.status || "pending_provider",
    idempotencyKey: row.idempotency_key || "",
    requestFingerprint: row.request_fingerprint || "",
    previousAccountStatus: row.previous_account_status || "",
    targetAccountStatus: row.target_account_status || "",
    targetState: objectOf(row.target_state),
    providerStatus: row.provider_status || "",
    providerResult: objectOf(row.provider_result),
    errorCode: row.error_code || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: toIso(row.completed_at),
  };
}

function rowToAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    patientId: row.patient_id || "",
    doctorUserId: row.doctor_user_id || "",
    createdByUserId: row.created_by_user_id || "",
    type: row.type || "remote_consultation",
    status: row.status || "scheduled",
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    location: row.location || "",
    channel: row.channel || "",
    reason: row.reason || "",
    notes: row.notes || "",
    cancellationReason: row.cancellation_reason || "",
    cancelledAt: toIso(row.cancelled_at),
    completedAt: toIso(row.completed_at),
    rescheduleReason: row.reschedule_reason || "",
    rescheduledAt: toIso(row.rescheduled_at),
    rescheduledByUserId: row.rescheduled_by_user_id || "",
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
    authorityType: row.authority_type || "administrative_assignment",
    purpose: row.purpose || "",
    consentedAt: toIso(row.consented_at),
    expiresAt: toIso(row.expires_at),
    revokedAt: toIso(row.revoked_at),
    revokedByUserId: row.revoked_by_user_id || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToDevice(row) {
  if (!row) return null;
  return normalizeDeviceSecretMaterial({
    id: row.id,
    organizationId: row.organization_id || "",
    pairedUserId: row.paired_user_id || "",
    ownerUserId: row.owner_user_id || row.paired_user_id || "",
    assignedPatientId: row.assigned_patient_id || "",
    ownershipState: row.ownership_state || "provisioned",
    revokedByUserId: row.revoked_by_user_id || "",
    name: row.name || "",
    type: row.type || "stethoscope",
    manufacturer: row.manufacturer || "",
    model: row.model || "",
    serialNumber: row.serial_number || "",
    purchaseDate: row.purchase_date ? String(row.purchase_date).slice(0, 10) : "",
    status: row.status || "unclaimed",
    signal: row.signal === null || row.signal === undefined ? null : Number(row.signal),
    battery: row.battery === null || row.battery === undefined ? null : Number(row.battery),
    connected: Boolean(row.connected),
    connectionMethod: row.connection_method || "",
    secretHash: row.secret_hash || "",
    credentialRotation: sanitizeDeviceCredentialRotation(row.credential_rotation),
    firmwareVersion: row.firmware_version || "",
    telemetry: sanitizeDeviceTelemetry(row.telemetry),
    lastSeenAt: toIso(row.last_seen_at),
    revokedAt: toIso(row.revoked_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function rowToDeviceCommand(row) {
  if (!row) return null;
  return {
    protocolVersion: Number(row.protocol_version || 1),
    id: row.id,
    deviceId: row.device_id || "",
    organizationId: row.organization_id || "",
    type: row.command_type || row.type || "",
    correlationId: row.correlation_id || "",
    state: row.state || "accepted",
    code: row.code || "",
    detail: row.detail || "",
    requestedByUserId: row.requested_by_user_id || "",
    idempotencyKey: row.idempotency_key || "",
    requestFingerprint: row.request_fingerprint || "",
    delivery: objectOf(row.delivery),
    issuedAt: toIso(row.issued_at),
    expiresAt: toIso(row.expires_at),
    acceptedAt: toIso(row.accepted_at),
    queuedAt: toIso(row.queued_at),
    deliveredAt: toIso(row.delivered_at),
    acknowledgedAt: toIso(row.acknowledged_at),
    applyingAt: toIso(row.applying_at),
    appliedAt: toIso(row.applied_at),
    failedAt: toIso(row.failed_at),
    expiredAt: toIso(row.expired_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function repairLegacyDeviceSecretRows(pool, rows = []) {
  for (const row of rows) {
    const storedMaterial = typeof row?.secret_hash === "string" ? row.secret_hash : "";
    const canonicalMaterial = storedMaterial ? canonicalDeviceSecretHash(storedMaterial) : "";
    if (!canonicalMaterial || canonicalMaterial === storedMaterial) continue;
    await pool.query(
      "UPDATE devices SET secret_hash = $2 WHERE id = $1 AND secret_hash = $3",
      [row.id, canonicalMaterial, storedMaterial],
    );
    row.secret_hash = canonicalMaterial;
  }
}

function rowToScan(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    patientId: row.patient_id || "",
    patientName: row.patient_name || row.patientName || "",
    deviceId: row.device_id || "",
    createdByUserId: row.created_by_user_id || "",
    idempotencyKey: row.idempotency_key || "",
    status: row.status || "recording",
    processingStatus: row.processing_status || "recording",
    processingGeneration: row.processing_generation === null || row.processing_generation === undefined
      ? 0
      : Number(row.processing_generation),
    processingIntent: row.processing_intent || "",
    processingArtifactFingerprint: row.processing_artifact_fingerprint || "",
    processingRunId: row.processing_run_id || "",
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
    audioFileId: row.audio_file_id || "",
    aiResultId: row.ai_result_id || "",
    uploadedBytes: row.uploaded_bytes === null || row.uploaded_bytes === undefined ? 0 : Number(row.uploaded_bytes),
    audioChunkCount: row.audio_chunk_count === null || row.audio_chunk_count === undefined ? 0 : Number(row.audio_chunk_count),
    audioUploadCompletedAt: toIso(row.audio_upload_completed_at),
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

function rowToChatMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role || "user",
    content: row.content || "",
    userId: row.user_id || "",
    organizationId: row.organization_id || "",
    provider: row.provider || "",
    model: row.model || "",
    createdAt: toIso(row.created_at),
  };
}

function rowToTwoFactorEnrollment(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || "",
    method: row.method || "app",
    secretCiphertext: row.secret_ciphertext || "",
    secretIv: row.secret_iv || "",
    secretTag: row.secret_tag || "",
    secretVersion: Number(row.secret_version || 1),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 5),
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    consumedAt: toIso(row.consumed_at) || null,
  };
}

function rowToTwoFactorCredential(row) {
  if (!row) return null;
  return {
    id: row.id || `2fa_credential_${row.user_id}`,
    userId: row.user_id || "",
    method: row.method || "app",
    enrollmentId: row.enrollment_id || "",
    secretCiphertext: row.secret_ciphertext || "",
    secretIv: row.secret_iv || "",
    secretTag: row.secret_tag || "",
    secretVersion: Number(row.secret_version || 1),
    recoverySalt: row.recovery_salt || "",
    recoveryCodes: Array.isArray(row.recovery_codes) ? row.recovery_codes : [],
    lastUsedTimeStep:
      row.last_used_time_step === null || row.last_used_time_step === undefined
        ? null
        : Number(row.last_used_time_step),
    disableAttempts: Number(row.disable_attempts || 0),
    disableLockedUntil: toIso(row.disable_locked_until) || null,
    enabledAt: toIso(row.enabled_at),
    updatedAt: toIso(row.updated_at),
    disabledAt: toIso(row.disabled_at) || null,
    version: Number(row.version || 1),
  };
}

function rowToTwoFactorChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || "",
    primaryAuthSource: row.primary_auth_source || "",
    primaryBindingHash: row.primary_binding_hash || "",
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 5),
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    completedAt: toIso(row.completed_at) || null,
  };
}

function rowToTwoFactorToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || "",
    tokenHash: row.token_hash || "",
    primaryBindingHash: row.primary_binding_hash || "",
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    lastUsedAt: toIso(row.last_used_at) || null,
    revokedAt: toIso(row.revoked_at) || null,
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
    organizationId: row.organization_id || "",
    createdByUserId: row.created_by_user_id || "",
    format: row.format || "json",
    dataset: row.dataset || "clinical_bundle",
    scopeKind: row.scope_kind || "workspace",
    filters: row.filters_json && typeof row.filters_json === "object" ? row.filters_json : {},
    rendererVersion: row.renderer_version || EXPORT_ARTIFACT_RENDERER_VERSION,
    status: row.status || "pending",
    includeAudio: Boolean(row.include_audio),
    includeReports: Boolean(row.include_reports),
    includeHistory: Boolean(row.include_history),
    startDate: toIso(row.start_date).slice(0, 10),
    endDate: toIso(row.end_date).slice(0, 10),
    recordCount: row.record_count === null || row.record_count === undefined ? 0 : Number(row.record_count),
    downloadUrl: row.download_url || "",
    snapshot: row.snapshot_json && typeof row.snapshot_json === "object" ? row.snapshot_json : {},
    artifactByteSize:
      row.artifact_byte_size === null || row.artifact_byte_size === undefined
        ? 0
        : Number(row.artifact_byte_size),
    artifactSha256: row.artifact_sha256 || "",
    downloadedAt: toIso(row.downloaded_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function exportPatientRecord(patient) {
  return {
    id: patient.id,
    organizationId: patient.organizationId || "",
    patientCode: patient.patientCode || "",
    name: patient.name || "",
    dateOfBirth: patient.dateOfBirth || "",
    age: patient.age ?? null,
    gender: patient.gender || "",
    bloodType: patient.bloodType || "",
    allergies: Array.isArray(patient.allergies) ? patient.allergies : [],
    emergencyContact:
      patient.emergencyContact && typeof patient.emergencyContact === "object"
        ? patient.emergencyContact
        : {},
    phone: patient.phone || "",
    email: patient.email || "",
    address: patient.address || "",
    notes: patient.notes || "",
    primaryDoctorId: patient.primaryDoctorId || "",
    createdAt: patient.createdAt || "",
    updatedAt: patient.updatedAt || "",
  };
}

function exportScanRecord(scan) {
  return {
    id: scan.id,
    organizationId: scan.organizationId || "",
    patientId: scan.patientId || "",
    deviceId: scan.deviceId || "",
    status: scan.status || "",
    processingStatus: scan.processingStatus || "",
    mode: scan.mode || "",
    bodySite: scan.bodySite || "",
    startedAt: scan.startedAt || "",
    endedAt: scan.endedAt || "",
    sampleRate: Number(scan.sampleRate || 0),
    sampleCount: Number(scan.sampleCount || 0),
    durationSeconds: Number(scan.durationSeconds || 0),
    bpm: Number(scan.bpm || 0),
    aiLabel: scan.aiLabel || "",
    aiConfidence: scan.aiConfidence ?? null,
    aiSummary: scan.aiSummary || "",
    doctorNotes: scan.doctorNotes || "",
    createdAt: scan.createdAt || "",
    updatedAt: scan.updatedAt || "",
  };
}

function exportAudioMetadataRecord(audioFile) {
  return {
    id: audioFile.id,
    scanId: audioFile.scanId || "",
    patientId: audioFile.patientId || "",
    contentType: audioFile.contentType || "",
    byteSize: Number(audioFile.byteSize || 0),
    sampleRate: Number(audioFile.sampleRate || 0),
    createdAt: audioFile.createdAt || "",
  };
}

function exportAiResultRecord(result) {
  return {
    id: result.id,
    scanId: result.scanId || "",
    modelVersion: result.modelVersion || "",
    label: result.label || "",
    confidence: result.confidence ?? null,
    summary: result.summary || "",
    status: result.status || "",
    errorCode: result.errorCode || "",
    createdAt: result.createdAt || "",
    updatedAt: result.updatedAt || "",
  };
}

function exportAppointmentRecord(appointment) {
  return {
    id: appointment.id,
    organizationId: appointment.organizationId || "",
    patientId: appointment.patientId || "",
    doctorUserId: appointment.doctorUserId || "",
    type: appointment.type || "",
    status: appointment.status || "",
    startsAt: appointment.startsAt || "",
    endsAt: appointment.endsAt || "",
    location: appointment.location || "",
    channel: appointment.channel || "",
    reason: appointment.reason || "",
    notes: appointment.notes || "",
    cancellationReason: appointment.cancellationReason || "",
    cancelledAt: appointment.cancelledAt || "",
    completedAt: appointment.completedAt || "",
    createdAt: appointment.createdAt || "",
    updatedAt: appointment.updatedAt || "",
  };
}

function exportDeviceRecord(device) {
  return {
    id: device.id,
    organizationId: device.organizationId || "",
    assignedPatientId: device.assignedPatientId || "",
    name: device.name || "",
    type: device.type || "",
    manufacturer: device.manufacturer || "",
    model: device.model || "",
    serialNumber: device.serialNumber || "",
    status: device.status || "",
    firmwareVersion: device.firmwareVersion || "",
    lastSeenAt: device.lastSeenAt || "",
    createdAt: device.createdAt || "",
    updatedAt: device.updatedAt || "",
  };
}

function exportAuditLogRecord(log, db) {
  const actor = (db.users || []).find((user) => user.id === log.actorUserId) || null;
  const organization = (db.organizations || []).find(
    (workspace) => workspace.id === log.organizationId,
  ) || null;
  const metadata = sanitizeAuditMetadata(log.metadata || {});
  const declaredOutcome = String(metadata.outcome || metadata.status || "").toLowerCase();
  return {
    id: log.id || "",
    createdAt: log.createdAt || "",
    actorUserId: log.actorUserId || "",
    actorName: actor?.name || actor?.email || "",
    actorRole: actor?.role || "",
    workspaceId: log.organizationId || "",
    organizationId: log.organizationId || "",
    organizationName: organization?.name || "",
    action: log.action || "",
    resourceType: log.resourceType || "",
    resourceId: log.resourceId || "",
    outcome: ["success", "failure", "warning", "denied"].includes(declaredOutcome)
      ? declaredOutcome
      : "recorded",
    ip: log.ip || "",
    userAgent: log.userAgent || "",
    metadata,
  };
}

function assembleAuditExportSnapshot(input, logs, db) {
  const auditLogs = logs.map((log) => exportAuditLogRecord(log, db));
  return {
    schemaVersion: "shcare.export.v1",
    exportId: input.exportId,
    dataset: "audit_logs",
    generatedAt: input.generatedAt,
    scope: {
      organizationId: input.organizationId,
      workspaceId: input.organizationId,
      kind: input.scopeKind || "workspace",
      actorUserId: input.actorUserId || "",
      patientIds: [],
    },
    filters: { ...input.auditFilters },
    counts: { auditLogs: auditLogs.length, total: auditLogs.length },
    data: { auditLogs },
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
  const aiChatInFlight = new Map();
  const twoFactorChallengeInFlight = new Map();
  const twoFactorUserInFlight = new Map();
  const patientMutationInFlight = new Map();
  const patientShareMutationInFlight = new Map();
  const workspaceOwnerMutationInFlight = new Map();
  const managedAdminCreateInFlight = new Map();
  const deviceProvisionMutationInFlight = new Map();
  const audioProcessingInFlight = new Map();
  const exportMutationInFlight = new Map();
  const servicePackageMutationInFlight = new Map();
  const notificationCampaignMutationInFlight = new Map();
  const clinicalWorkflow = createClinicalWorkflowRepository({
    getDb,
    saveDb,
    createId,
    nowIso,
    getPool,
    onSqlError,
  });
  const scanAudioUploads = createScanAudioUploadRepository({
    getDb,
    saveDb,
    createId,
    nowIso,
    getPool,
  });
  const storageMetadata = createStorageMetadataRepository({
    getDb,
    saveDb,
    createId,
    nowIso,
    getPool,
  });
  const staffInvitations = createStaffInvitationRepository({
    getDb,
    saveDb,
    createId,
    nowIso,
    getPool,
  });
  const workspaceLifecycle = createWorkspaceLifecycleRepository({
    getDb,
    saveDb,
    createId,
    nowIso,
    getPool,
  });

  function snapshotRuntimeDb(runtimeDb) {
    return JSON.parse(JSON.stringify(runtimeDb));
  }

  function cloneRuntimeValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function restoreRuntimeDb(runtimeDb, snapshot) {
    for (const key of Object.keys(runtimeDb)) delete runtimeDb[key];
    Object.assign(runtimeDb, snapshot);
  }

  function getTwoFactorDisableLockMs() {
    const configured = Number(process.env.TWO_FACTOR_DISABLE_LOCK_MS || 5 * 60 * 1000);
    const minimum = process.env.NODE_ENV === "test" ? 100 : 60 * 1000;
    return Math.min(30 * 60 * 1000, Math.max(minimum, Number.isFinite(configured) ? configured : 5 * 60 * 1000));
  }

  async function runTwoFactorUserExclusive(userId, operation) {
    while (twoFactorUserInFlight.has(userId)) {
      await twoFactorUserInFlight.get(userId).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    twoFactorUserInFlight.set(userId, promise);
    try {
      return await promise;
    } finally {
      if (twoFactorUserInFlight.get(userId) === promise) twoFactorUserInFlight.delete(userId);
    }
  }

  async function runPatientShareMutationExclusive(_patientId, operation) {
    // The JSON runtime has no database uniqueness constraint or advisory lock.
    // Serialize the complete patient-share ledger so one Idempotency-Key cannot
    // race across two patient ids and commit two different outcomes.
    const key = "global";
    while (patientShareMutationInFlight.has(key)) {
      await patientShareMutationInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    patientShareMutationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (patientShareMutationInFlight.get(key) === promise) {
        patientShareMutationInFlight.delete(key);
      }
    }
  }

  async function runPatientMutationExclusive(operation) {
    // The JSON runtime has no transactional idempotency index. Serialize the
    // patient ledger so duplicate create/update/delete requests cannot commit
    // two outcomes before the first Idempotency-Key is persisted.
    const key = "global";
    while (patientMutationInFlight.has(key)) {
      await patientMutationInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    patientMutationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (patientMutationInFlight.get(key) === promise) {
        patientMutationInFlight.delete(key);
      }
    }
  }

  async function runWorkspaceOwnerMutationExclusive(workspaceId, operation) {
    const key = String(workspaceId || "");
    while (workspaceOwnerMutationInFlight.has(key)) {
      await workspaceOwnerMutationInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    workspaceOwnerMutationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (workspaceOwnerMutationInFlight.get(key) === promise) {
        workspaceOwnerMutationInFlight.delete(key);
      }
    }
  }

  async function runManagedAdminCreateExclusive(operation) {
    // JSON has no advisory locks. Serialize the whole managed-admin creation
    // ledger so different idempotency keys cannot race the same email into two
    // local accounts. PostgreSQL additionally locks the normalized email.
    const key = "managed-admin:create";
    while (managedAdminCreateInFlight.has(key)) {
      await managedAdminCreateInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    managedAdminCreateInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (managedAdminCreateInFlight.get(key) === promise) {
        managedAdminCreateInFlight.delete(key);
      }
    }
  }

  async function runDeviceProvisionMutationExclusive(operation) {
    // JSON has neither a unique mutation ledger nor advisory locks. Serialize
    // provisioning globally so the same Idempotency-Key cannot create two
    // device ids when the caller lets the server generate the id.
    const key = "device-provision";
    while (deviceProvisionMutationInFlight.has(key)) {
      await deviceProvisionMutationInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    deviceProvisionMutationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (deviceProvisionMutationInFlight.get(key) === promise) {
        deviceProvisionMutationInFlight.delete(key);
      }
    }
  }

  async function runAudioProcessingExclusive(scanId, operation) {
    const key = String(scanId || "");
    while (audioProcessingInFlight.has(key)) {
      await audioProcessingInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    audioProcessingInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (audioProcessingInFlight.get(key) === promise) {
        audioProcessingInFlight.delete(key);
      }
    }
  }

  async function runExportMutationExclusive(idempotency, operation) {
    const key = [
      String(idempotency?.scope || ""),
      String(idempotency?.operation || "export.create"),
      String(idempotency?.key || ""),
    ].join(":");
    while (exportMutationInFlight.has(key)) {
      await exportMutationInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    exportMutationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (exportMutationInFlight.get(key) === promise) {
        exportMutationInFlight.delete(key);
      }
    }
  }

  async function runNotificationCampaignMutationExclusive(idempotency, operation) {
    const key = [
      String(idempotency?.scope || ""),
      String(idempotency?.operation || "notification.campaign.create"),
      String(idempotency?.key || ""),
    ].join(":");
    while (notificationCampaignMutationInFlight.has(key)) {
      await notificationCampaignMutationInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    notificationCampaignMutationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (notificationCampaignMutationInFlight.get(key) === promise) {
        notificationCampaignMutationInFlight.delete(key);
      }
    }
  }

  async function runServicePackageMutationExclusive(operation) {
    // JSON has no unique index or advisory lock. Serialize the catalog so
    // duplicate names/ids and idempotency replays are decided atomically.
    const key = "service-package:catalog";
    while (servicePackageMutationInFlight.has(key)) {
      await servicePackageMutationInFlight.get(key).catch(() => {});
    }
    const promise = Promise.resolve().then(operation);
    servicePackageMutationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (servicePackageMutationInFlight.get(key) === promise) {
        servicePackageMutationInFlight.delete(key);
      }
    }
  }

  function assertRuntimeOperationalWorkspace(runtimeDb, targetState = {}) {
    const role = String(targetState.role || "");
    const organizationId = String(targetState.organizationId || "");
    if (!["workspace_admin", "doctor", "nurse", "technician", "billing", "viewer"].includes(role)) return;
    const workspace = (runtimeDb.organizations || []).find((item) => item.id === organizationId) || null;
    if (!workspace) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Operational workspace does not exist");
    assertActiveManagedAdminWorkspace(role, workspace);
  }

  async function assertSqlOperationalWorkspace(client, targetState = {}) {
    const role = String(targetState.role || "");
    const organizationId = String(targetState.organizationId || "");
    if (!["workspace_admin", "doctor", "nurse", "technician", "billing", "viewer"].includes(role)) return;
    const selected = await client.query(
      "SELECT id, status, workspace_type, type FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
      [organizationId],
    );
    if (!selected.rows[0]) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Operational workspace does not exist");
    assertActiveManagedAdminWorkspace(role, selected.rows[0]);
  }

  async function withSql(operation) {
    const pool = getPool();
    if (!pool) {
      return null;
    }
    try {
      return await operation(pool);
    } catch (err) {
      onSqlError(err);
      throw repositoryError(
        503,
        "DATA_BACKEND_UNAVAILABLE",
        "The canonical PostgreSQL data backend is unavailable",
        { cause: String(err?.code || err?.message || "SQL_ERROR") },
      );
    }
  }

  async function withSqlTransaction(operation) {
    const pool = getPool();
    if (!pool) return null;
    const client = typeof pool.connect === "function" ? await pool.connect() : pool;
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      onSqlError(err);
      throw err;
    } finally {
      if (client !== pool && typeof client.release === "function") client.release();
    }
  }

  function repositoryError(statusCode, code, message, details) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    if (details) error.details = details;
    return error;
  }

  const WORKSPACE_OWNER_MEMBERSHIP_ROLES = new Set(["owner", "workspace_owner"]);
  const WORKSPACE_OWNER_CAPABLE_ROLES = new Set(["admin", "platform_admin", "workspace_owner"]);

  function requiresWorkspaceOwnerGuard(operation, targetState = {}) {
    if (operation === "lock" || operation === "delete") return true;
    return operation === "change_role" && !WORKSPACE_OWNER_CAPABLE_ROLES.has(String(targetState.role || ""));
  }

  function isActiveSharedWorkspace(workspace) {
    if (!workspace) return false;
    const status = String(workspace.status || "active").toLowerCase();
    const workspaceType = String(workspace.workspaceType || workspace.type || "clinic").toLowerCase();
    return status === "active" && workspaceType !== "personal";
  }

  function isActiveRuntimeUser(user) {
    return Boolean(user) && String(user.accountStatus || "active").toLowerCase() === "active";
  }

  function isOperationalRuntimeWorkspaceOwner(user) {
    return isActiveRuntimeUser(user) && String(user.role || "patient").toLowerCase() !== "patient";
  }

  function assertRuntimeWorkspaceOwnerTransition(runtimeDb, targetUserId, operation, targetState = {}) {
    if (!requiresWorkspaceOwnerGuard(operation, targetState)) return;
    const allWorkspaces = runtimeDb.organizations || [];
    if (operation === "delete") {
      const personalWorkspaceIds = allWorkspaces
        .filter((workspace) => {
          const status = String(workspace.status || "active").toLowerCase();
          const workspaceType = String(workspace.workspaceType || workspace.type || "clinic").toLowerCase();
          return status === "active" && workspaceType === "personal" && workspace.ownerUserId === targetUserId;
        })
        .map((workspace) => workspace.id)
        .sort();
      if (personalWorkspaceIds.length > 0) {
        throw repositoryError(
          409,
          "PERSONAL_WORKSPACE_RETENTION_REQUIRED",
          "Archive the personal workspace through the data-retention workflow before deleting its owner",
          { operation, workspaceIds: personalWorkspaceIds },
        );
      }
    }
    const workspaces = allWorkspaces.filter(isActiveSharedWorkspace);
    const usersById = new Map((runtimeDb.users || []).map((user) => [user.id, user]));
    const memberships = runtimeDb.memberships || [];
    const transferRequired = workspaces
      .filter((workspace) => workspace.ownerUserId === targetUserId)
      .map((workspace) => workspace.id)
      .sort();
    if (transferRequired.length > 0) {
      throw repositoryError(
        409,
        "WORKSPACE_OWNER_TRANSFER_REQUIRED",
        "Transfer every active shared workspace before changing this owner's account",
        { operation, workspaceIds: transferRequired },
      );
    }

    const lastOwnerWorkspaces = memberships
      .filter(
        (membership) =>
          membership.userId === targetUserId &&
          String(membership.status || "active").toLowerCase() === "active" &&
          WORKSPACE_OWNER_MEMBERSHIP_ROLES.has(String(membership.role || "").toLowerCase()),
      )
      .map((membership) => workspaces.find((workspace) => workspace.id === membership.organizationId))
      .filter(Boolean)
      .filter((workspace) => {
        return !memberships.some((membership) => {
          if (
            membership.organizationId !== workspace.id ||
            membership.userId === targetUserId ||
            String(membership.status || "active").toLowerCase() !== "active" ||
            !WORKSPACE_OWNER_MEMBERSHIP_ROLES.has(String(membership.role || "").toLowerCase())
          ) return false;
          return isOperationalRuntimeWorkspaceOwner(usersById.get(membership.userId));
        });
      })
      .map((workspace) => workspace.id)
      .filter((workspaceId, index, items) => items.indexOf(workspaceId) === index)
      .sort();
    if (lastOwnerWorkspaces.length > 0) {
      throw repositoryError(
        409,
        "LAST_WORKSPACE_OWNER_REQUIRED",
        "At least one active owner must remain in every shared workspace",
        { operation, workspaceIds: lastOwnerWorkspaces },
      );
    }
  }

  async function queryLockWorkspaceOwnerMutation(client) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["identity-operation:workspace-owner-guard"]);
    // Identity finalization is short and rare. Locking the two ownership tables
    // closes the read-then-delete race with an explicit owner transfer or invite.
    await client.query("LOCK TABLE organizations, memberships IN SHARE ROW EXCLUSIVE MODE");
  }

  async function queryAssertWorkspaceOwnerTransition(client, targetUserId, operation, targetState = {}) {
    if (!requiresWorkspaceOwnerGuard(operation, targetState)) return;
    await queryLockWorkspaceOwnerMutation(client);
    if (operation === "delete") {
      const personalOwned = await client.query(
        `
          SELECT id
          FROM organizations
          WHERE owner_user_id = $1
            AND LOWER(COALESCE(status, 'active')) = 'active'
            AND LOWER(COALESCE(workspace_type, type, 'clinic')) = 'personal'
          ORDER BY id
          FOR UPDATE
        `,
        [targetUserId],
      );
      if (personalOwned.rows.length > 0) {
        throw repositoryError(
          409,
          "PERSONAL_WORKSPACE_RETENTION_REQUIRED",
          "Archive the personal workspace through the data-retention workflow before deleting its owner",
          { operation, workspaceIds: personalOwned.rows.map((row) => row.id) },
        );
      }
    }
    await client.query(
      `
        WITH related_workspaces AS (
          SELECT organization.id
          FROM organizations organization
          WHERE organization.owner_user_id = $1
            AND LOWER(COALESCE(organization.status, 'active')) = 'active'
            AND LOWER(COALESCE(organization.workspace_type, organization.type, 'clinic')) <> 'personal'
          UNION
          SELECT membership.organization_id
          FROM memberships membership
          JOIN organizations organization ON organization.id = membership.organization_id
          WHERE membership.user_id = $1
            AND membership.role IN ('owner', 'workspace_owner')
            AND LOWER(COALESCE(membership.status, 'active')) = 'active'
            AND LOWER(COALESCE(organization.status, 'active')) = 'active'
            AND LOWER(COALESCE(organization.workspace_type, organization.type, 'clinic')) <> 'personal'
        ), owner_candidates AS (
          SELECT organization.owner_user_id AS user_id
          FROM organizations organization
          JOIN related_workspaces related ON related.id = organization.id
          WHERE organization.owner_user_id IS NOT NULL
          UNION
          SELECT membership.user_id
          FROM memberships membership
          JOIN related_workspaces related ON related.id = membership.organization_id
          WHERE membership.role IN ('owner', 'workspace_owner')
            AND LOWER(COALESCE(membership.status, 'active')) = 'active'
        )
        SELECT account.id
        FROM users account
        WHERE account.id = $1 OR account.id IN (SELECT user_id FROM owner_candidates)
        ORDER BY account.id
        FOR UPDATE
      `,
      [targetUserId],
    );

    const owned = await client.query(
      `
        SELECT id
        FROM organizations
        WHERE owner_user_id = $1
          AND LOWER(COALESCE(status, 'active')) = 'active'
          AND LOWER(COALESCE(workspace_type, type, 'clinic')) <> 'personal'
        ORDER BY id
        FOR UPDATE
      `,
      [targetUserId],
    );
    if (owned.rows.length > 0) {
      throw repositoryError(
        409,
        "WORKSPACE_OWNER_TRANSFER_REQUIRED",
        "Transfer every active shared workspace before changing this owner's account",
        { operation, workspaceIds: owned.rows.map((row) => row.id) },
      );
    }

    const lastOwner = await client.query(
      `
        SELECT target_membership.organization_id AS id
        FROM memberships target_membership
        JOIN organizations organization ON organization.id = target_membership.organization_id
        WHERE target_membership.user_id = $1
          AND target_membership.role IN ('owner', 'workspace_owner')
          AND LOWER(COALESCE(target_membership.status, 'active')) = 'active'
          AND LOWER(COALESCE(organization.status, 'active')) = 'active'
          AND LOWER(COALESCE(organization.workspace_type, organization.type, 'clinic')) <> 'personal'
          AND NOT EXISTS (
            SELECT 1
            FROM memberships other_membership
            JOIN users other_owner ON other_owner.id = other_membership.user_id
            WHERE other_membership.organization_id = target_membership.organization_id
              AND other_membership.user_id <> $1
              AND other_membership.role IN ('owner', 'workspace_owner')
              AND LOWER(COALESCE(other_membership.status, 'active')) = 'active'
              AND LOWER(COALESCE(other_owner.account_status, 'active')) = 'active'
              AND LOWER(COALESCE(other_owner.role, 'patient')) <> 'patient'
          )
        ORDER BY target_membership.organization_id
        FOR UPDATE OF target_membership, organization
      `,
      [targetUserId],
    );
    if (lastOwner.rows.length > 0) {
      throw repositoryError(
        409,
        "LAST_WORKSPACE_OWNER_REQUIRED",
        "At least one active owner must remain in every shared workspace",
        { operation, workspaceIds: lastOwner.rows.map((row) => row.id) },
      );
    }
  }

  function createAuditLog(input = {}) {
    return {
      id: input.id || createId("audit"),
      actorUserId: input.actorUserId || "",
      organizationId: input.organizationId || "",
      action: input.action || "unknown",
      resourceType: input.resourceType || "",
      resourceId: input.resourceId || "",
      ip: input.ip || "",
      userAgent: input.userAgent || "",
      metadata: sanitizeAuditMetadata(input.metadata || {}),
      createdAt: input.createdAt || nowIso(),
    };
  }

  async function queryInsertAuditLog(queryable, log) {
    return queryable.query(
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
      ],
    );
  }

  function syncRuntimeAuditLog(log) {
    const db = getDb();
    db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
    if (!db.auditLogs.some((item) => item.id === log.id)) db.auditLogs.unshift(log);
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
          INSERT INTO organizations (
            id, name, type, workspace_type, address, phone, email, website, status,
            legal_name, representative, owner_user_id, package_id, subscription_status,
            billing_cycle, request_metadata, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11,
            CASE WHEN $12 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $12) THEN $12 ELSE NULL END,
            $13, $14, $15, $16::jsonb, now()
          )
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            workspace_type = EXCLUDED.workspace_type,
            address = EXCLUDED.address,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            website = EXCLUDED.website,
            status = EXCLUDED.status,
            legal_name = EXCLUDED.legal_name,
            representative = EXCLUDED.representative,
            owner_user_id = EXCLUDED.owner_user_id,
            package_id = EXCLUDED.package_id,
            subscription_status = EXCLUDED.subscription_status,
            billing_cycle = EXCLUDED.billing_cycle,
            request_metadata = EXCLUDED.request_metadata,
            updated_at = now()
        `,
        [
          organization.id,
          organization.name || organization.id,
          organization.type || "clinic",
          organization.workspaceType || organization.type || "clinic",
          optional(organization.address),
          optional(organization.phone),
          optional(organization.email),
          optional(organization.website),
          organization.status || "active",
          optional(organization.legalName),
          optional(organization.representative),
          optional(organization.ownerUserId),
          optional(organization.packageId),
          organization.subscriptionStatus || "trial",
          organization.billingCycle || "monthly",
          JSON.stringify(objectOf(organization.requestMetadata)),
        ]
      )
    );
  }

  async function upsertMembershipSql(membership) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO memberships (
            id, organization_id, user_id, role, status, suspended_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (organization_id, user_id)
          DO UPDATE SET
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            suspended_at = EXCLUDED.suspended_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          membership.id,
          membership.organizationId,
          membership.userId,
          membership.role || "patient",
          membership.status || "active",
          optionalTimestamp(membership.suspendedAt),
          membership.updatedAt || membership.createdAt || nowIso(),
        ]
      )
    );
  }

  async function queryUpsertNotification(queryable, notification) {
    return queryable.query(
        `
          INSERT INTO notifications (
            id, user_id, organization_id, type, title, message, channel, delivery_status,
            sent_at, failed_at, retry_count, error_message,
            push_status, push_sent_at, push_failed_at, push_error_message, push_attempts, metadata, read_at,
            campaign_id, audience_type, audience_role, requested_channels, in_app_status, email_status,
            email_error_message, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9::timestamptz, $10::timestamptz, $11, $12,
            $13, $14::timestamptz, $15::timestamptz, $16, $17::jsonb, $18::jsonb, $19::timestamptz,
            $20, $21, $22, $23::jsonb, $24, $25, $26, now()
          )
          ON CONFLICT (id)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            organization_id = EXCLUDED.organization_id,
            type = EXCLUDED.type,
            title = EXCLUDED.title,
            message = EXCLUDED.message,
            channel = EXCLUDED.channel,
            delivery_status = EXCLUDED.delivery_status,
            sent_at = EXCLUDED.sent_at,
            failed_at = EXCLUDED.failed_at,
            retry_count = EXCLUDED.retry_count,
            error_message = EXCLUDED.error_message,
            push_status = EXCLUDED.push_status,
            push_sent_at = EXCLUDED.push_sent_at,
            push_failed_at = EXCLUDED.push_failed_at,
            push_error_message = EXCLUDED.push_error_message,
            push_attempts = EXCLUDED.push_attempts,
            metadata = EXCLUDED.metadata,
            read_at = EXCLUDED.read_at,
            campaign_id = EXCLUDED.campaign_id,
            audience_type = EXCLUDED.audience_type,
            audience_role = EXCLUDED.audience_role,
            requested_channels = EXCLUDED.requested_channels,
            in_app_status = EXCLUDED.in_app_status,
            email_status = EXCLUDED.email_status,
            email_error_message = EXCLUDED.email_error_message,
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
          optionalTimestamp(notification.sentAt),
          optionalTimestamp(notification.failedAt),
          Number(notification.retryCount || 0),
          optional(notification.errorMessage || ""),
          notification.pushStatus || "ready",
          optionalTimestamp(notification.pushSentAt),
          optionalTimestamp(notification.pushFailedAt),
          optional(notification.pushErrorMessage || ""),
          JSON.stringify(Array.isArray(notification.pushAttempts) ? notification.pushAttempts : []),
          JSON.stringify(notification.metadata && typeof notification.metadata === "object" ? notification.metadata : {}),
          notification.read || notification.readAt ? notification.readAt || nowIso() : null,
          optional(notification.campaignId),
          notification.audienceType || "legacy",
          optional(notification.audienceRole),
          JSON.stringify(Array.isArray(notification.requestedChannels) && notification.requestedChannels.length > 0
            ? notification.requestedChannels
            : [notification.channel || "in_app"]),
          notification.inAppStatus || "ready",
          notification.emailStatus || "skipped",
          optional(notification.emailErrorMessage || ""),
        ]
      );
  }

  async function upsertNotificationSql(notification) {
    await withSql((pool) => queryUpsertNotification(pool, notification));
  }

  async function queryInsertChatMessage(queryable, message) {
    await queryable.query(
      `
        INSERT INTO chat_messages (
          id, role, content, user_id, organization_id, provider, model, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
        ON CONFLICT (id) DO NOTHING
      `,
      [
        message.id,
        message.role,
        message.content,
        optional(message.userId),
        optional(message.organizationId),
        optional(message.provider),
        optional(message.model),
        optionalTimestamp(message.createdAt),
      ],
    );
  }

  async function queryUpsertPatient(queryable, patient) {
    await queryable.query(
        `
          INSERT INTO patients (
            id, organization_id, owner_user_id, patient_code, name, age, date_of_birth, blood_type,
            allergies, emergency_contact, gender, phone, email, address, notes, guardian_user_id,
            profile_type, relationship, family_group_id, account_user_id, primary_doctor_id,
            doctor_name, created_at, updated_at
          )
          VALUES (
            $1, $2,
            CASE WHEN $3 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $3) THEN $3 ELSE NULL END,
            $4, $5, $6, $7::date, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15,
            CASE WHEN $16 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $16) THEN $16 ELSE NULL END,
            $17, $18, $19,
            CASE WHEN $20 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $20) THEN $20 ELSE NULL END,
            CASE WHEN $21 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $21) THEN $21 ELSE NULL END,
            $22, COALESCE($23::timestamptz, now()), COALESCE($24::timestamptz, now())
          )
          ON CONFLICT (id)
          DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            owner_user_id = EXCLUDED.owner_user_id,
            patient_code = EXCLUDED.patient_code,
            name = EXCLUDED.name,
            age = EXCLUDED.age,
            date_of_birth = EXCLUDED.date_of_birth,
            blood_type = EXCLUDED.blood_type,
            allergies = EXCLUDED.allergies,
            emergency_contact = EXCLUDED.emergency_contact,
            gender = EXCLUDED.gender,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            address = EXCLUDED.address,
            notes = EXCLUDED.notes,
            guardian_user_id = EXCLUDED.guardian_user_id,
            profile_type = EXCLUDED.profile_type,
            relationship = EXCLUDED.relationship,
            family_group_id = EXCLUDED.family_group_id,
            account_user_id = EXCLUDED.account_user_id,
            primary_doctor_id = EXCLUDED.primary_doctor_id,
            doctor_name = EXCLUDED.doctor_name,
            updated_at = EXCLUDED.updated_at
        `,
        [
          patient.id,
          optional(patient.organizationId),
          optional(patient.ownerUserId),
          patient.patientCode || patient.id,
          patient.name || patient.patientCode || patient.id,
          patient.age === undefined || patient.age === "" ? null : patient.age,
          patient.dateOfBirth || null,
          optional(patient.bloodType),
          JSON.stringify(Array.isArray(patient.allergies) ? patient.allergies : []),
          JSON.stringify(objectOf(patient.emergencyContact)),
          optional(patient.gender),
          optional(patient.phone),
          optional(patient.email),
          optional(patient.address),
          optional(patient.notes),
          optional(patient.guardianUserId),
          patient.profileType || (patient.ownerUserId ? "dependent" : "patient"),
          optional(patient.relationship),
          optional(patient.familyGroupId),
          optional(patient.accountUserId),
          optional(patient.primaryDoctorId),
          optional(patient.doctorName),
          optional(patient.createdAt),
          patient.updatedAt || nowIso(),
        ],
      );
  }

  async function upsertPatientSql(patient) {
    await withSql((pool) => queryUpsertPatient(pool, patient));
  }

  async function queryUpsertAppointment(queryable, appointment) {
    await queryable.query(
      `
        INSERT INTO appointments (
          id, organization_id, patient_id, doctor_user_id, created_by_user_id,
          type, status, starts_at, ends_at, location, channel, reason, notes,
          cancellation_reason, cancelled_at, completed_at,
          reschedule_reason, rescheduled_at, rescheduled_by_user_id,
          created_at, updated_at
        )
        VALUES (
          $1, $2,
          CASE WHEN $3 IS NOT NULL AND EXISTS (SELECT 1 FROM patients WHERE id = $3) THEN $3 ELSE NULL END,
          CASE WHEN $4 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $4) THEN $4 ELSE NULL END,
          CASE WHEN $5 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $5) THEN $5 ELSE NULL END,
          $6, $7, $8::timestamptz, $9::timestamptz, $10, $11, $12, $13,
          $14, $15::timestamptz, $16::timestamptz, $17, $18::timestamptz,
          CASE WHEN $19 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $19) THEN $19 ELSE NULL END,
          COALESCE($20::timestamptz, now()), COALESCE($21::timestamptz, now())
        )
        ON CONFLICT (id)
        DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          patient_id = EXCLUDED.patient_id,
          doctor_user_id = EXCLUDED.doctor_user_id,
          created_by_user_id = EXCLUDED.created_by_user_id,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          location = EXCLUDED.location,
          channel = EXCLUDED.channel,
          reason = EXCLUDED.reason,
          notes = EXCLUDED.notes,
          cancellation_reason = EXCLUDED.cancellation_reason,
          cancelled_at = EXCLUDED.cancelled_at,
          completed_at = EXCLUDED.completed_at,
          reschedule_reason = EXCLUDED.reschedule_reason,
          rescheduled_at = EXCLUDED.rescheduled_at,
          rescheduled_by_user_id = EXCLUDED.rescheduled_by_user_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        appointment.id,
        optional(appointment.organizationId),
        optional(appointment.patientId),
        optional(appointment.doctorUserId),
        optional(appointment.createdByUserId),
        appointment.type || "remote_consultation",
        appointment.status || "scheduled",
        optionalTimestamp(appointment.startsAt),
        optionalTimestamp(appointment.endsAt),
        optional(appointment.location),
        optional(appointment.channel),
        optional(appointment.reason),
        optional(appointment.notes),
        optional(appointment.cancellationReason),
        optionalTimestamp(appointment.cancelledAt),
        optionalTimestamp(appointment.completedAt),
        optional(appointment.rescheduleReason),
        optionalTimestamp(appointment.rescheduledAt),
        optional(appointment.rescheduledByUserId),
        optionalTimestamp(appointment.createdAt),
        appointment.updatedAt || nowIso(),
      ],
    );
  }

  async function upsertAppointmentSql(appointment) {
    await withSql((pool) => queryUpsertAppointment(pool, appointment));
  }

  async function queryUpsertPatientShare(queryable, grant) {
    return queryable.query(
        `
          INSERT INTO doctor_patient_access (
            id, doctor_user_id, doctor_id, patient_id, organization_id, access_level, scope, scan_ids,
            granted_by_user_id, authority_type, purpose, consented_at,
            expires_at, revoked_at, revoked_by_user_id, created_at, updated_at
          )
          VALUES (
            $1, $2, $2, $3,
            $4,
            $5, $6, $7::jsonb,
            CASE WHEN $8 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $8) THEN $8 ELSE NULL END,
            $9, $10, $11::timestamptz,
            $12::timestamptz, $13::timestamptz,
            CASE WHEN $14 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $14) THEN $14 ELSE NULL END,
            COALESCE($15::timestamptz, now()), COALESCE($16::timestamptz, now())
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
            authority_type = EXCLUDED.authority_type,
            purpose = EXCLUDED.purpose,
            consented_at = EXCLUDED.consented_at,
            expires_at = EXCLUDED.expires_at,
            revoked_at = EXCLUDED.revoked_at,
            revoked_by_user_id = EXCLUDED.revoked_by_user_id,
            updated_at = EXCLUDED.updated_at
          RETURNING *
        `,
        [
          grant.id,
          grant.doctorUserId || grant.doctorId || null,
          grant.patientId,
          optional(grant.organizationId),
          grant.accessLevel || "read",
          grant.scope || (Array.isArray(grant.scanIds) && grant.scanIds.length ? "selected_scans" : "patient_profile"),
          JSON.stringify(Array.isArray(grant.scanIds) ? grant.scanIds : []),
          optional(grant.grantedByUserId),
          grant.authorityType || "administrative_assignment",
          grant.purpose || "",
          optionalTimestamp(grant.consentedAt),
          optionalTimestamp(grant.expiresAt),
          optionalTimestamp(grant.revokedAt),
          optional(grant.revokedByUserId),
          optional(grant.createdAt),
          grant.updatedAt || nowIso(),
        ],
      );
  }

  async function queryUpsertDevice(queryable, device, options = {}) {
    normalizeDeviceSecretMaterial(device);
    const telemetry = sanitizeDeviceTelemetry(device.telemetry);
    const ownershipState = inferDeviceOwnershipState(device);
    const ownerUserId = device.ownerUserId || device.pairedUserId || null;
    const writeOwnership = options.writeOwnership === true;
    const writeSecretHash = options.writeSecretHash === true;
    const writeSecretHashIfMissing = options.writeSecretHashIfMissing === true;
    const writeCredentialRotation = options.writeCredentialRotation === true;
    const secretHashUpdate = writeSecretHash
      ? "EXCLUDED.secret_hash"
      : writeSecretHashIfMissing
        ? "COALESCE(NULLIF(devices.secret_hash, ''), EXCLUDED.secret_hash)"
        : "devices.secret_hash";
    return queryable.query(
        `
          INSERT INTO devices (
            id, organization_id, paired_user_id, ownership_state, owner_user_id,
            assigned_patient_id, revoked_by_user_id, name, type, status, signal, battery, connected,
            connection_method, secret_hash, firmware_version, manufacturer, model, serial_number, purchase_date,
            last_seen_at, revoked_at, created_at, updated_at, telemetry, credential_rotation
          )
          VALUES (
            $1, $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20::date, $21, $22,
            COALESCE($23::timestamptz, now()), COALESCE($24::timestamptz, now()), $25::jsonb, $26::jsonb
          )
          ON CONFLICT (id)
          DO UPDATE SET
            organization_id = ${writeOwnership ? "EXCLUDED.organization_id" : "devices.organization_id"},
            paired_user_id = ${writeOwnership ? "EXCLUDED.paired_user_id" : "devices.paired_user_id"},
            ownership_state = ${writeOwnership ? "EXCLUDED.ownership_state" : "devices.ownership_state"},
            owner_user_id = ${writeOwnership ? "EXCLUDED.owner_user_id" : "devices.owner_user_id"},
            assigned_patient_id = ${writeOwnership ? "EXCLUDED.assigned_patient_id" : "devices.assigned_patient_id"},
            revoked_by_user_id = ${writeOwnership ? "EXCLUDED.revoked_by_user_id" : "devices.revoked_by_user_id"},
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            status = CASE
              WHEN devices.ownership_state = 'revoked' OR devices.revoked_at IS NOT NULL THEN 'revoked'
              ELSE EXCLUDED.status
            END,
            signal = EXCLUDED.signal,
            battery = EXCLUDED.battery,
            connected = CASE
              WHEN devices.ownership_state = 'revoked' OR devices.revoked_at IS NOT NULL THEN false
              ELSE EXCLUDED.connected
            END,
            connection_method = EXCLUDED.connection_method,
            secret_hash = ${secretHashUpdate},
            firmware_version = EXCLUDED.firmware_version,
            manufacturer = EXCLUDED.manufacturer,
            model = EXCLUDED.model,
            serial_number = EXCLUDED.serial_number,
            purchase_date = EXCLUDED.purchase_date,
            last_seen_at = EXCLUDED.last_seen_at,
            revoked_at = COALESCE(devices.revoked_at, EXCLUDED.revoked_at),
            telemetry = EXCLUDED.telemetry,
            credential_rotation = ${writeCredentialRotation
              ? "EXCLUDED.credential_rotation"
              : "devices.credential_rotation"},
            updated_at = EXCLUDED.updated_at
          RETURNING *
        `,
        [
          device.id,
          optional(device.organizationId),
          optional(device.pairedUserId),
          ownershipState,
          optional(ownerUserId),
          optional(device.assignedPatientId),
          optional(device.revokedByUserId),
          device.name || device.id,
          device.type || "stethoscope",
          device.status || "unclaimed",
          device.signal === undefined || device.signal === "" ? null : device.signal,
          device.battery === undefined || device.battery === "" ? null : device.battery,
          Boolean(device.connected),
          optional(device.connectionMethod),
          optional(device.secretHash),
          optional(device.firmwareVersion || device.firmware),
          optional(device.manufacturer),
          optional(device.model),
          optional(device.serialNumber),
          device.purchaseDate === undefined || device.purchaseDate === "" ? null : device.purchaseDate,
          optional(device.lastSeenAt),
          optional(device.revokedAt),
          optional(device.createdAt),
          device.updatedAt || nowIso(),
          JSON.stringify(telemetry),
          JSON.stringify(sanitizeDeviceCredentialRotation(device.credentialRotation)),
        ]
      );
  }

  async function queryInsertDeviceClaim(queryable, claim) {
    await queryable.query(
      `
        INSERT INTO device_claims (
          id, device_id, organization_id, claim_code_hash, created_by_user_id,
          claimed_by_user_id, expires_at, claimed_at, revoked_at,
          revoked_by_user_id, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7::timestamptz, $8::timestamptz, $9::timestamptz,
          $10, COALESCE($11::timestamptz, now()), COALESCE($12::timestamptz, now())
        )
        ON CONFLICT (id) DO NOTHING
      `,
      [
        claim.id,
        claim.deviceId,
        optional(claim.organizationId),
        claim.claimCodeHash,
        optional(claim.createdByUserId),
        optional(claim.claimedByUserId),
        claim.expiresAt,
        optionalTimestamp(claim.claimedAt),
        optionalTimestamp(claim.revokedAt),
        optional(claim.revokedByUserId),
        optionalTimestamp(claim.createdAt),
        optionalTimestamp(claim.updatedAt || claim.createdAt),
      ],
    );
  }

  async function upsertDeviceSql(device) {
    return withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `device-generic-save:${device.id}`,
      ]);
      const currentResult = await client.query(
        "SELECT * FROM devices WHERE id = $1 FOR UPDATE",
        [device.id],
      );
      const currentRows = (currentResult.rows || []).filter((row) => row.id === device.id);
      await repairLegacyDeviceSecretRows(client, currentRows);
      const currentDevice = currentRows[0] ? rowToDevice(currentRows[0]) : null;
      const canonicalDevice = mergeGenericDeviceUpdate(currentDevice, device);
      const result = await queryUpsertDevice(client, canonicalDevice);
      return result.rows?.[0] ? rowToDevice(result.rows[0]) : canonicalDevice;
    });
  }

  async function upsertScanSql(scan) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO scan_sessions (
            id, organization_id, patient_id, device_id, created_by_user_id, idempotency_key, status,
            processing_status, mode, body_site, started_at, ended_at, sample_rate, sample_count,
            duration_seconds, peak, rms, level_percent, bpm, ai_label, ai_confidence, ai_summary,
            doctor_notes, audio_url, wav_file, created_at, updated_at,
            uploaded_bytes, audio_chunk_count, audio_upload_completed_at,
            processing_generation, processing_intent, processing_artifact_fingerprint,
            processing_run_id, audio_file_id, ai_result_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, COALESCE($11::timestamptz, now()), $12::timestamptz, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22,
            $23, $24, $25, COALESCE($26::timestamptz, now()), COALESCE($27::timestamptz, now()),
            $28, $29, $30::timestamptz,
            $31, $32, $33, $34, $35, $36
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
            uploaded_bytes = EXCLUDED.uploaded_bytes,
            audio_chunk_count = EXCLUDED.audio_chunk_count,
            audio_upload_completed_at = EXCLUDED.audio_upload_completed_at,
            processing_generation = EXCLUDED.processing_generation,
            processing_intent = EXCLUDED.processing_intent,
            processing_artifact_fingerprint = EXCLUDED.processing_artifact_fingerprint,
            processing_run_id = EXCLUDED.processing_run_id,
            audio_file_id = EXCLUDED.audio_file_id,
            ai_result_id = EXCLUDED.ai_result_id,
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
          Number(scan.uploadedBytes || 0),
          Number(scan.audioChunkCount || 0),
          optionalTimestamp(scan.audioUploadCompletedAt),
          Number(scan.processingGeneration || 0),
          scan.processingIntent || "",
          scan.processingArtifactFingerprint || "",
          scan.processingRunId || "",
          optional(scan.audioFileId),
          optional(scan.aiResultId),
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
          aiResult.modelVersion || SIGNAL_QUALITY_ANALYZER_VERSION,
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

  async function saveAudioProcessingSql({ scan, audioFile, aiResult }) {
    return withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `audio-processing:${scan.id}`,
      ]);

      const currentScanResult = await client.query(
        "SELECT id, organization_id, patient_id FROM scan_sessions WHERE id = $1 LIMIT 1 FOR UPDATE",
        [scan.id],
      );
      const currentScan = currentScanResult.rows?.[0];
      if (!currentScan) {
        throw repositoryError(404, "SCAN_NOT_FOUND", "Scan was not found");
      }
      if (
        (currentScan.organization_id && scan.organizationId && currentScan.organization_id !== scan.organizationId) ||
        (currentScan.patient_id && scan.patientId && currentScan.patient_id !== scan.patientId)
      ) {
        throw repositoryError(409, "SCAN_SCOPE_CONFLICT", "Processed artifacts do not belong to this scan");
      }

      const scanResult = await client.query(
        `
          UPDATE scan_sessions
          SET status = $2,
              processing_status = $3,
              sample_rate = $4,
              sample_count = $5,
              duration_seconds = $6,
              peak = $7,
              rms = $8,
              level_percent = $9,
              ai_label = $10,
              ai_confidence = $11,
              ai_summary = $12,
              audio_url = $13,
              wav_file = $14,
              updated_at = COALESCE($15::timestamptz, now()),
              processing_generation = $16,
              processing_intent = $17,
              processing_artifact_fingerprint = $18,
              processing_run_id = $19,
              audio_file_id = $20,
              ai_result_id = $21
          WHERE id = $1
          RETURNING *
        `,
        [
          scan.id,
          scan.status || "completed",
          scan.processingStatus || scan.status || "completed",
          scan.sampleRate || 16000,
          scan.sampleCount || 0,
          scan.durationSeconds || 0,
          scan.peak || 0,
          scan.rms || 0,
          scan.levelPercent || 0,
          optional(scan.aiLabel),
          scan.aiConfidence === undefined || scan.aiConfidence === "" ? null : scan.aiConfidence,
          optional(scan.aiSummary),
          optional(scan.audioUrl),
          optional(scan.wavFile),
          scan.updatedAt || nowIso(),
          Number(scan.processingGeneration || 0),
          scan.processingIntent || "",
          scan.processingArtifactFingerprint || "",
          scan.processingRunId || "",
          optional(scan.audioFileId || audioFile.id),
          optional(scan.aiResultId || aiResult.id),
        ],
      );

      const audioResult = await client.query(
        `
          INSERT INTO audio_files (
            id, scan_id, patient_id, storage_provider, object_key, content_type, byte_size, sample_rate, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
          ON CONFLICT (id)
          DO UPDATE SET
            patient_id = EXCLUDED.patient_id,
            storage_provider = EXCLUDED.storage_provider,
            object_key = EXCLUDED.object_key,
            content_type = EXCLUDED.content_type,
            byte_size = EXCLUDED.byte_size,
            sample_rate = EXCLUDED.sample_rate
          WHERE audio_files.scan_id = EXCLUDED.scan_id
          RETURNING *
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
        ],
      );
      if (!audioResult.rows?.[0]) {
        throw repositoryError(409, "AUDIO_ARTIFACT_SCOPE_CONFLICT", "Audio artifact belongs to another scan");
      }

      const aiResultRow = await client.query(
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
          WHERE ai_results.scan_id = EXCLUDED.scan_id
          RETURNING *
        `,
        [
          aiResult.id,
          aiResult.scanId,
          aiResult.modelVersion || SIGNAL_QUALITY_ANALYZER_VERSION,
          optional(aiResult.label),
          aiResult.confidence === undefined || aiResult.confidence === "" ? null : aiResult.confidence,
          optional(aiResult.summary),
          JSON.stringify(aiResult.rawResult || {}),
          aiResult.status || "queued",
          optional(aiResult.errorCode),
          optional(aiResult.createdAt),
          aiResult.updatedAt || nowIso(),
        ],
      );
      if (!aiResultRow.rows?.[0]) {
        throw repositoryError(409, "AI_ARTIFACT_SCOPE_CONFLICT", "AI result belongs to another scan");
      }

      return {
        scan: rowToScan(scanResult.rows?.[0]),
        audioFile: rowToAudioFile(audioResult.rows[0]),
        aiResult: rowToAiResult(aiResultRow.rows[0]),
      };
    });
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

  async function queryUpsertDeviceCommand(queryable, command) {
    await queryable.query(
        `
          INSERT INTO device_commands (
            id, device_id, organization_id, requested_by_user_id,
            protocol_version, command_type, correlation_id, state, code, detail,
            delivery, idempotency_key, request_fingerprint,
            issued_at, expires_at, accepted_at, queued_at, delivered_at,
            acknowledged_at, applying_at, applied_at, failed_at, expired_at,
            created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11::jsonb, $12, $13,
            $14::timestamptz, $15::timestamptz, $16::timestamptz,
            $17::timestamptz, $18::timestamptz, $19::timestamptz,
            $20::timestamptz, $21::timestamptz, $22::timestamptz,
            $23::timestamptz, $24::timestamptz, $25::timestamptz
          )
          ON CONFLICT (id) DO UPDATE SET
            state = EXCLUDED.state,
            code = EXCLUDED.code,
            detail = EXCLUDED.detail,
            delivery = EXCLUDED.delivery,
            queued_at = COALESCE(EXCLUDED.queued_at, device_commands.queued_at),
            delivered_at = COALESCE(EXCLUDED.delivered_at, device_commands.delivered_at),
            acknowledged_at = COALESCE(EXCLUDED.acknowledged_at, device_commands.acknowledged_at),
            applying_at = COALESCE(EXCLUDED.applying_at, device_commands.applying_at),
            applied_at = COALESCE(EXCLUDED.applied_at, device_commands.applied_at),
            failed_at = COALESCE(EXCLUDED.failed_at, device_commands.failed_at),
            expired_at = COALESCE(EXCLUDED.expired_at, device_commands.expired_at),
            updated_at = EXCLUDED.updated_at
        `,
        [
          command.id,
          command.deviceId,
          optional(command.organizationId),
          optional(command.requestedByUserId),
          Number(command.protocolVersion || 1),
          command.type,
          command.correlationId,
          command.state || "accepted",
          optional(command.code),
          optional(command.detail),
          JSON.stringify(command.delivery || {}),
          optional(command.idempotencyKey),
          optional(command.requestFingerprint),
          command.issuedAt,
          command.expiresAt,
          command.acceptedAt || command.issuedAt,
          optional(command.queuedAt),
          optional(command.deliveredAt),
          optional(command.acknowledgedAt),
          optional(command.applyingAt),
          optional(command.appliedAt),
          optional(command.failedAt),
          optional(command.expiredAt),
          command.createdAt || command.issuedAt,
          command.updatedAt || nowIso(),
        ],
      );
  }

  async function upsertDeviceCommandSql(command) {
    await withSql((pool) => queryUpsertDeviceCommand(pool, command));
  }

  async function upsertNotificationDeviceSql(device) {
    return withSql(async (pool) => {
      const result = await pool.query(
        `
          INSERT INTO notification_devices (id, user_id, platform, fcm_token, enabled, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), COALESCE($7::timestamptz, now()))
          ON CONFLICT (fcm_token)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            platform = EXCLUDED.platform,
            enabled = EXCLUDED.enabled,
            updated_at = EXCLUDED.updated_at
          RETURNING *
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
      );
      return result.rows[0] ? rowToNotificationDevice(result.rows[0]) : null;
    });
  }

  async function queryUpsertAuthSession(queryable, session) {
    await queryable.query(
      `
        INSERT INTO auth_sessions (
          id, user_id, refresh_token_hash, access_token_hash, device, ip,
          revoked_at, created_at, last_seen_at
        )
        VALUES (
          $1, $2, $3, $4, $5, NULLIF($6, '')::inet,
          $7::timestamptz, COALESCE($8::timestamptz, now()), COALESCE($9::timestamptz, now())
        )
        ON CONFLICT (id)
        DO UPDATE SET
          device = EXCLUDED.device,
          ip = EXCLUDED.ip,
          revoked_at = EXCLUDED.revoked_at,
          last_seen_at = EXCLUDED.last_seen_at
      `,
      [
        session.id,
        session.userId,
        session.sessionKey,
        optional(session.tokenBindingHash),
        optional(session.device || session.userAgent),
        session.ip || "",
        optionalTimestamp(session.revokedAt),
        optionalTimestamp(session.createdAt),
        optionalTimestamp(session.lastSeenAt),
      ],
    );
  }

  function accountProfileClaimsPatch(patch = {}) {
    const profilePatch = {};
    for (const key of [
      "title",
      "specialty",
      "avatarFileId",
      "avatarUrl",
      "avatarStorage",
      "twoFactorEnabled",
      "twoFactorMethod",
      "notificationPreferences",
      "activePatientId",
    ]) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) profilePatch[key] = patch[key];
    }
    return profilePatch;
  }

  async function queryUpdateAccountProfile(queryable, identifier, patch = {}) {
    const id = String(identifier || "");
    if (Object.prototype.hasOwnProperty.call(patch, "organizationId") && patch.organizationId) {
      const workspaceResult = await queryable.query("SELECT id FROM organizations WHERE id = $1 LIMIT 1", [patch.organizationId]);
      if (!workspaceResult.rows[0]) {
        throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace not found");
      }
    }
    const result = await queryable.query(
      `
        UPDATE users
        SET
          name = $2,
          phone = $3,
          license = $4,
          hospital = $5,
          department = $6,
          address = $7,
          organization_id = CASE WHEN $8 IS NULL THEN organization_id ELSE $8 END,
          firebase_claims = jsonb_set(
            COALESCE(users.firebase_claims, '{}'::jsonb),
            '{profile}',
            COALESCE(users.firebase_claims->'profile', '{}'::jsonb) || $9::jsonb,
            true
          ),
          updated_at = now()
        WHERE id = $1 OR firebase_uid = $1 OR lower(email) = lower($1)
        RETURNING *
      `,
      [
        id,
        patch.name || "",
        patch.phone || "",
        patch.license || "",
        patch.hospital || "",
        patch.department || "",
        patch.address || "",
        patch.organizationId || null,
        JSON.stringify(accountProfileClaimsPatch(patch)),
      ],
    );
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  function assertRuntimeAccountMutationAuthorization(authorization, user) {
    if (!authorization) return;
    const actorUserId = String(authorization.actorUserId || "");
    if (!actorUserId || actorUserId !== user.id) {
      throw repositoryError(403, "ACCOUNT_SCOPE_DENIED", "Account mutation is outside the authenticated user scope");
    }
    if (authorization.kind === "platform_workspace_switch") {
      if (!["admin", "platform_admin"].includes(String(user.role || ""))) {
        throw repositoryError(403, "ACCOUNT_SCOPE_DENIED", "Platform workspace permission is required");
      }
      return;
    }
    if (authorization.kind === "workspace_switch") {
      const organizationId = String(authorization.organizationId || "");
      const membership = (getDb().memberships || []).find(
        (item) =>
          item.userId === actorUserId &&
          item.organizationId === organizationId &&
          String(item.status || "active").toLowerCase() === "active",
      );
      if (!membership) {
        throw repositoryError(403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is required");
      }
    }
    if (authorization.kind === "active_profile") {
      const patientId = String(authorization.patientId || "");
      const patient = (getDb().patients || []).find(
        (item) => item.id === patientId && !item.deletedAt,
      );
      if (!patient || (patient.ownerUserId !== actorUserId && patient.accountUserId !== actorUserId)) {
        throw repositoryError(403, "PROFILE_SCOPE_DENIED", "Active profile is outside the authenticated family scope");
      }
    }
  }

  async function assertSqlAccountMutationAuthorization(client, authorization, userId) {
    if (!authorization) return;
    const actorUserId = String(authorization.actorUserId || "");
    if (!actorUserId || actorUserId !== userId) {
      throw repositoryError(403, "ACCOUNT_SCOPE_DENIED", "Account mutation is outside the authenticated user scope");
    }
    const actor = await client.query("SELECT id, role FROM users WHERE id = $1 LIMIT 1 FOR UPDATE", [actorUserId]);
    if (!actor.rows[0]) {
      throw repositoryError(403, "ACCOUNT_SCOPE_DENIED", "Authenticated account no longer exists");
    }
    if (authorization.kind === "platform_workspace_switch") {
      if (!["admin", "platform_admin"].includes(String(actor.rows[0].role || ""))) {
        throw repositoryError(403, "ACCOUNT_SCOPE_DENIED", "Platform workspace permission is required");
      }
      return;
    }
    if (authorization.kind === "workspace_switch") {
      const membership = await client.query(
        `
          SELECT 1
          FROM memberships
          WHERE user_id = $1
            AND organization_id = $2
            AND LOWER(COALESCE(status, 'active')) = 'active'
          LIMIT 1
          FOR UPDATE
        `,
        [actorUserId, String(authorization.organizationId || "")],
      );
      if (!membership.rows[0]) {
        throw repositoryError(403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is required");
      }
    }
    if (authorization.kind === "active_profile") {
      const patient = await client.query(
        `
          SELECT 1 FROM patients
          WHERE id = $1 AND deleted_at IS NULL
            AND (owner_user_id = $2 OR account_user_id = $2)
          LIMIT 1 FOR UPDATE
        `,
        [String(authorization.patientId || ""), actorUserId],
      );
      if (!patient.rows[0]) {
        throw repositoryError(403, "PROFILE_SCOPE_DENIED", "Active profile is outside the authenticated family scope");
      }
    }
  }

  const PATIENT_WORKSPACE_MUTATION_ROLES = new Set(["workspace_owner", "workspace_admin", "doctor"]);
  const PATIENT_SHARE_WORKSPACE_ROLES = new Set([
    "workspace_owner",
    "owner",
    "workspace_admin",
    "admin",
    "doctor",
  ]);

  function assertRuntimePatientMutationAuthorization(authorization, patient) {
    if (!authorization) return;
    const actorUserId = String(authorization.actorUserId || "");
    const organizationId = String(authorization.organizationId || patient.organizationId || "");
    const operation = String(authorization.operation || "update");
    const actor = (getDb().users || []).find((item) => item.id === actorUserId);
    if (!actor) throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Authenticated account no longer exists");
    if (patient.organizationId !== organizationId) {
      throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient workspace does not match the authorized workspace");
    }
    if (authorization.kind === "platform") {
      if (!["admin", "platform_admin"].includes(actor.role)) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Platform patient permission is required");
      }
      return;
    }
    const membership = (getDb().memberships || []).find(
      (item) =>
        item.userId === actorUserId &&
        item.organizationId === organizationId &&
        String(item.status || "active").toLowerCase() === "active",
    );
    if (!membership) {
      throw repositoryError(403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is required");
    }
    const existing = (getDb().patients || []).find((item) => item.id === patient.id && !item.deletedAt) || null;
    if (authorization.kind === "workspace") {
      if (!PATIENT_WORKSPACE_MUTATION_ROLES.has(String(membership.role || ""))) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Workspace patient-management permission is required");
      }
      if (operation === "create" && existing) {
        throw repositoryError(409, "PATIENT_ID_CONFLICT", "Patient identifier already exists");
      }
      if (operation !== "create" && existing?.organizationId !== organizationId) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient record is outside the authorized workspace");
      }
      return;
    }
    if (authorization.kind !== "personal") {
      throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient mutation authorization is invalid");
    }
    if (operation === "create") {
      if (existing || patient.ownerUserId !== actorUserId) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Dependent profile must be created by its owning account");
      }
      return;
    }
    if (!existing || (existing.ownerUserId !== actorUserId && existing.accountUserId !== actorUserId)) {
      throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient profile is outside the authenticated family scope");
    }
  }

  async function assertSqlPatientMutationAuthorization(client, authorization, patient) {
    if (!authorization) return;
    const actorUserId = String(authorization.actorUserId || "");
    const organizationId = String(authorization.organizationId || patient.organizationId || "");
    const operation = String(authorization.operation || "update");
    if (patient.organizationId !== organizationId) {
      throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient workspace does not match the authorized workspace");
    }
    const actor = await client.query("SELECT role FROM users WHERE id = $1 LIMIT 1 FOR UPDATE", [actorUserId]);
    if (!actor.rows[0]) throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Authenticated account no longer exists");
    if (authorization.kind === "platform") {
      if (!["admin", "platform_admin"].includes(String(actor.rows[0].role || ""))) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Platform patient permission is required");
      }
      return;
    }
    const membership = await client.query(
      `
        SELECT role
        FROM memberships
        WHERE user_id = $1
          AND organization_id = $2
          AND LOWER(COALESCE(status, 'active')) = 'active'
        LIMIT 1
        FOR UPDATE
      `,
      [actorUserId, organizationId],
    );
    if (!membership.rows[0]) {
      throw repositoryError(403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is required");
    }
    const existing = await client.query(
      `
        SELECT organization_id, owner_user_id, account_user_id
        FROM patients
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE
      `,
      [patient.id],
    );
    if (authorization.kind === "workspace") {
      if (!PATIENT_WORKSPACE_MUTATION_ROLES.has(String(membership.rows[0].role || ""))) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Workspace patient-management permission is required");
      }
      if (operation === "create" && existing.rows[0]) {
        throw repositoryError(409, "PATIENT_ID_CONFLICT", "Patient identifier already exists");
      }
      if (operation !== "create" && existing.rows[0]?.organization_id !== organizationId) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient record is outside the authorized workspace");
      }
      return;
    }
    if (authorization.kind !== "personal") {
      throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient mutation authorization is invalid");
    }
    if (operation === "create") {
      if (existing.rows[0] || patient.ownerUserId !== actorUserId) {
        throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Dependent profile must be created by its owning account");
      }
      return;
    }
    if (
      !existing.rows[0] ||
      (existing.rows[0].owner_user_id !== actorUserId && existing.rows[0].account_user_id !== actorUserId)
    ) {
      throw repositoryError(403, "PATIENT_SCOPE_DENIED", "Patient profile is outside the authenticated family scope");
    }
  }

  function assertRuntimePatientShareAuthorization(authorization, patientId) {
    if (!authorization) return;
    const actorUserId = String(authorization.actorUserId || "");
    const expectedPatientId = String(authorization.patientId || patientId || "");
    const organizationId = String(authorization.organizationId || "");
    if (!actorUserId || !expectedPatientId || expectedPatientId !== patientId) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share mutation is outside the authorized scope");
    }
    const actor = (getDb().users || []).find((item) => item.id === actorUserId) || null;
    const patient = (getDb().patients || []).find(
      (item) => item.id === patientId && !item.deletedAt,
    ) || null;
    if (!actor || !patient) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share actor or patient no longer exists");
    }
    if (String(actor.accountStatus || "active") !== "active") {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share actor is not active");
    }
    if (authorization.kind === "platform") {
      if (!["admin", "platform_admin"].includes(String(actor.role || ""))) {
        throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Platform patient-share permission is required");
      }
      return;
    }
    if (authorization.kind === "personal") {
      if (
        patient.ownerUserId !== actorUserId &&
        patient.accountUserId !== actorUserId &&
        patient.guardianUserId !== actorUserId
      ) {
        throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share is outside the authenticated family scope");
      }
      return;
    }
    if (authorization.kind !== "workspace" || !organizationId || patient.organizationId !== organizationId) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient workspace no longer matches the authorized scope");
    }
    const membership = (getDb().memberships || []).find(
      (item) =>
        item.userId === actorUserId &&
        item.organizationId === organizationId &&
        String(item.status || "active") === "active",
    ) || null;
    if (!membership) {
      throw repositoryError(403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is required");
    }
    if (!PATIENT_SHARE_WORKSPACE_ROLES.has(String(membership.role || ""))) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Workspace patient-share permission is required");
    }
    const workspace = (getDb().organizations || []).find(
      (item) => item.id === organizationId && String(item.status || "active") === "active",
    ) || null;
    if (!workspace) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient workspace is not operational");
    }
  }

  async function assertSqlPatientShareAuthorization(client, authorization, patientId) {
    if (!authorization) return;
    const actorUserId = String(authorization.actorUserId || "");
    const expectedPatientId = String(authorization.patientId || patientId || "");
    const organizationId = String(authorization.organizationId || "");
    if (!actorUserId || !expectedPatientId || expectedPatientId !== patientId) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share mutation is outside the authorized scope");
    }
    const actor = await client.query(
      "SELECT id, role, account_status FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
      [actorUserId],
    );
    const patient = await client.query(
      `
        SELECT organization_id, owner_user_id, account_user_id, guardian_user_id
        FROM patients
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE
      `,
      [patientId],
    );
    if (!actor.rows[0] || !patient.rows[0]) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share actor or patient no longer exists");
    }
    if (String(actor.rows[0].account_status || "active") !== "active") {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share actor is not active");
    }
    if (authorization.kind === "platform") {
      if (!["admin", "platform_admin"].includes(String(actor.rows[0].role || ""))) {
        throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Platform patient-share permission is required");
      }
      return;
    }
    if (authorization.kind === "personal") {
      if (
        patient.rows[0].owner_user_id !== actorUserId &&
        patient.rows[0].account_user_id !== actorUserId &&
        patient.rows[0].guardian_user_id !== actorUserId
      ) {
        throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient share is outside the authenticated family scope");
      }
      return;
    }
    if (
      authorization.kind !== "workspace" ||
      !organizationId ||
      patient.rows[0].organization_id !== organizationId
    ) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Patient workspace no longer matches the authorized scope");
    }
    const membership = await client.query(
      `
        SELECT membership.role
        FROM memberships membership
        JOIN organizations workspace ON workspace.id = membership.organization_id
        WHERE membership.user_id = $1
          AND membership.organization_id = $2
          AND COALESCE(membership.status, 'active') = 'active'
          AND COALESCE(workspace.status, 'active') = 'active'
        LIMIT 1
        FOR UPDATE OF membership, workspace
      `,
      [actorUserId, organizationId],
    );
    if (!membership.rows[0]) {
      throw repositoryError(403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is required");
    }
    if (!PATIENT_SHARE_WORKSPACE_ROLES.has(String(membership.rows[0].role || ""))) {
      throw repositoryError(403, "PATIENT_SHARE_SCOPE_DENIED", "Workspace patient-share permission is required");
    }
  }

  function assertPatientShareAuthorityType(authorization, grant) {
    if (!authorization) return;
    const expectedAuthorityType =
      authorization.kind === "personal"
        ? "patient_consent"
        : grant.doctorUserId || grant.doctorId
          ? "clinician_access_grant"
          : "administrative_assignment";
    if (grant.authorityType !== expectedAuthorityType) {
      throw repositoryError(
        403,
        "SHARE_AUTHORITY_TYPE_MISMATCH",
        "Patient access authority type must be derived from the authenticated actor and recipient",
      );
    }
    if (
      expectedAuthorityType === "patient_consent" &&
      grant.grantedByUserId !== authorization.actorUserId
    ) {
      throw repositoryError(
        403,
        "SHARE_CONSENT_ACTOR_MISMATCH",
        "Patient consent must be attributed to the authenticated patient or guardian",
      );
    }
  }

  async function querySyncFirebaseIdentity(queryable, userId, identity) {
    const result = await queryable.query(
      `
        UPDATE users
        SET firebase_uid = CASE
              WHEN firebase_uid IS NULL OR firebase_uid = '' THEN $2
              ELSE firebase_uid
            END,
            email = CASE WHEN $3 <> '' THEN $3 ELSE email END,
            phone = CASE WHEN $4 <> '' THEN $4 ELSE phone END,
            verified_email = verified_email OR $5,
            verified_phone = verified_phone OR $6,
            updated_at = now()
        WHERE id = $1
          AND (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid = $2)
        RETURNING *
      `,
      [
        userId,
        identity.firebaseUid,
        identity.email || "",
        identity.phone || "",
        Boolean(identity.emailVerified),
        Boolean(identity.phoneVerified),
      ],
    );
    if (!result.rows[0]) {
      throw repositoryError(401, "FIREBASE_IDENTITY_CONFLICT", "Firebase identity conflicts with the linked account");
    }
    return rowToUser(result.rows[0]);
  }

  function personalWorkspaceIdForUser(userId) {
    return `org_personal_${String(userId || "user").replace(/[^a-zA-Z0-9_]/g, "_")}`;
  }

  function buildRepositorySelfPatient(user, organizationId) {
    const createdAt = nowIso();
    return {
      id: createId("pat"),
      organizationId,
      ownerUserId: user.id,
      patientCode: `SELF-${String(user.id).replace(/^usr_?/, "").slice(0, 12)}`,
      name: user.name || user.email || "Shcare user",
      age: null,
      dateOfBirth: "",
      bloodType: "",
      allergies: [],
      emergencyContact: {},
      gender: "",
      phone: user.phone || "",
      email: user.email || "",
      address: user.address || "",
      notes: "Patient profile created for app account",
      guardianUserId: "",
      profileType: "self",
      relationship: "self",
      familyGroupId: "",
      accountUserId: user.id,
      primaryDoctorId: "",
      doctorName: "",
      createdAt,
      updatedAt: createdAt,
    };
  }

  async function resolveFirebaseIdentityGraph(input = {}) {
    const firebaseUid = String(input.firebaseUid || "");
    if (!firebaseUid) {
      throw repositoryError(401, "FIREBASE_UID_REQUIRED", "Firebase token is missing uid");
    }
    const email = input.emailVerified ? String(input.email || "").toLowerCase() : "";
    const identity = {
      firebaseUid,
      email,
      phone: String(input.phone || ""),
      emailVerified: Boolean(input.emailVerified && email),
      phoneVerified: Boolean(input.phone),
    };
    const runtimeDb = getDb();

    if (!getPool()) {
      let user = (runtimeDb.users || []).find((item) => item.firebaseUid === firebaseUid) || null;
      if (!user && email) {
        user = (runtimeDb.users || []).find(
          (item) => String(item.email || "").toLowerCase() === email,
        ) || null;
      }
      const created = !user;
      const previousFirebaseUid = user?.firebaseUid || "";
      if (user && previousFirebaseUid && previousFirebaseUid !== firebaseUid) {
        throw repositoryError(401, "FIREBASE_IDENTITY_CONFLICT", "Firebase identity conflicts with the linked account");
      }
      if (!user) {
        const createdAt = nowIso();
        user = {
          id: createId("usr"),
          firebaseUid,
          email,
          phone: identity.phone,
          role: "patient",
          name: String(input.name || "") || (email ? email.split("@")[0] : "Shcare user"),
          organizationId: "",
          verifiedEmail: identity.emailVerified,
          verifiedPhone: identity.phoneVerified,
          accountStatus: "active",
          createdAt,
          updatedAt: createdAt,
        };
        runtimeDb.users.unshift(user);
      } else {
        user.firebaseUid = firebaseUid;
        if (email) user.email = email;
        if (identity.phone) user.phone = identity.phone;
        user.verifiedEmail = Boolean(user.verifiedEmail || identity.emailVerified);
        user.verifiedPhone = Boolean(user.verifiedPhone || identity.phoneVerified);
        user.updatedAt = nowIso();
      }

      let workspace = null;
      let membership = null;
      let patient = null;
      let repaired = false;
      const memberships = (runtimeDb.memberships || []).filter((item) => item.userId === user.id);
      if (user.role === "patient") {
        membership = memberships.find((item) => item.organizationId === user.organizationId) || memberships[0] || null;
        if (!membership) {
          const organizationId = personalWorkspaceIdForUser(user.id);
          workspace = (runtimeDb.organizations || []).find((item) => item.id === organizationId) || null;
          if (!workspace) {
            workspace = {
              id: organizationId,
              name: `Hồ sơ cá nhân - ${user.name || user.email || user.id}`,
              type: "personal",
              workspaceType: "personal",
              status: "active",
              ownerUserId: user.id,
              packageId: "pkg_personal_family",
              subscriptionStatus: "trial",
              billingCycle: "monthly",
              createdAt: nowIso(),
              updatedAt: nowIso(),
            };
            runtimeDb.organizations.unshift(workspace);
          }
          membership = {
            id: createId("mbr"),
            organizationId,
            userId: user.id,
            role: "patient",
            createdAt: nowIso(),
          };
          runtimeDb.memberships.push(membership);
          repaired = true;
        }
        user.organizationId = membership.organizationId;
        workspace = workspace || (runtimeDb.organizations || []).find((item) => item.id === membership.organizationId) || null;
        patient = user.patientId
          ? (runtimeDb.patients || []).find(
              (item) => item.id === user.patientId && !item.deletedAt &&
                (item.accountUserId === user.id || item.ownerUserId === user.id),
            ) || null
          : null;
        if (!patient) {
          patient = (runtimeDb.patients || []).find(
            (item) => !item.deletedAt &&
              (item.accountUserId === user.id ||
                (item.ownerUserId === user.id && (item.profileType === "self" || item.relationship === "self"))),
          ) || null;
        }
        if (!patient) {
          patient = buildRepositorySelfPatient(user, membership.organizationId);
          runtimeDb.patients.unshift(patient);
          repaired = true;
        }
        patient.ownerUserId = user.id;
        patient.accountUserId = user.id;
        patient.profileType = "self";
        patient.relationship = "self";
        user.patientId = patient.id;
        user.activePatientId = user.activePatientId && (runtimeDb.patients || []).some(
          (item) => item.id === user.activePatientId && item.ownerUserId === user.id && !item.deletedAt,
        ) ? user.activePatientId : patient.id;
      }

      const linked = !previousFirebaseUid;
      let auditLog = null;
      if (created || linked || repaired) {
        auditLog = createAuditLog({
          action: created ? "account.firebase.onboard" : "account.firebase.reconcile",
          actorUserId: user.id,
          organizationId: user.organizationId || "",
          resourceType: "user",
          resourceId: user.id,
          ip: input.ip || "",
          userAgent: input.userAgent || "",
          metadata: { created, linked, repaired },
        });
        syncRuntimeAuditLog(auditLog);
      }
      syncArrayItem(runtimeDb.users, user);
      await saveDb();
      return { user, workspace, membership, patient, auditLog, created, repaired };
    }

    const result = await withSqlTransaction(async (client) => {
      const lockKeys = [`firebase-uid:${firebaseUid}`];
      if (email) lockKeys.push(`firebase-email:${email}`);
      for (const lockKey of lockKeys.sort()) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);
      }

      let selected = await client.query(
        "SELECT * FROM users WHERE firebase_uid = $1 LIMIT 1 FOR UPDATE",
        [firebaseUid],
      );
      if (!selected.rows[0] && email) {
        selected = await client.query(
          "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1 FOR UPDATE",
          [email],
        );
      }

      let user = selected.rows[0] ? rowToUser(selected.rows[0]) : null;
      const created = !user;
      const previousFirebaseUid = user?.firebaseUid || "";
      if (user && previousFirebaseUid && previousFirebaseUid !== firebaseUid) {
        throw repositoryError(401, "FIREBASE_IDENTITY_CONFLICT", "Firebase identity conflicts with the linked account");
      }

      let workspace = null;
      let membership = null;
      let patient = null;
      let repaired = false;
      if (!user) {
        const createdAt = nowIso();
        const userId = createId("usr");
        const organizationId = personalWorkspaceIdForUser(userId);
        await client.query(
          `
            INSERT INTO organizations (
              id, name, type, workspace_type, status, owner_user_id, package_id,
              subscription_status, billing_cycle, created_at, updated_at
            )
            VALUES ($1, $2, 'personal', 'personal', 'active', NULL, $3, 'trial', 'monthly', $4, $4)
            ON CONFLICT (id) DO NOTHING
          `,
          [organizationId, `Hồ sơ cá nhân - ${String(input.name || email || userId)}`, "pkg_personal_family", createdAt],
        );
        const inserted = await client.query(
          `
            INSERT INTO users (
              id, firebase_uid, email, phone, role, name, organization_id,
              verified_email, verified_phone, account_status, firebase_claims,
              created_at, updated_at
            )
            VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), 'patient', $5, $6, $7, $8, 'active', $9::jsonb, $10, $10)
            RETURNING *
          `,
          [
            userId,
            firebaseUid,
            email,
            identity.phone,
            String(input.name || "") || (email ? email.split("@")[0] : "Shcare user"),
            organizationId,
            identity.emailVerified,
            identity.phoneVerified,
            JSON.stringify({ workspaceType: "personal", accountType: "personal", profile: {} }),
            createdAt,
          ],
        );
        user = rowToUser(inserted.rows[0]);
      } else {
        user = await querySyncFirebaseIdentity(client, user.id, identity);
      }

      if (user.role === "patient") {
        const memberships = await client.query(
          "SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at ASC FOR UPDATE",
          [user.id],
        );
        let membershipRows = memberships.rows;
        if (membershipRows.length === 0) {
          const organizationId = personalWorkspaceIdForUser(user.id);
          await client.query(
            `
              INSERT INTO organizations (
                id, name, type, workspace_type, status, owner_user_id, package_id,
                subscription_status, billing_cycle, created_at, updated_at
              )
              VALUES ($1, $2, 'personal', 'personal', 'active', NULL, $3, 'trial', 'monthly', now(), now())
              ON CONFLICT (id) DO NOTHING
            `,
            [organizationId, `Hồ sơ cá nhân - ${user.name || user.email || user.id}`, "pkg_personal_family"],
          );
          const insertedMembership = await client.query(
            `
              INSERT INTO memberships (id, organization_id, user_id, role, created_at)
              VALUES ($1, $2, $3, 'patient', now())
              ON CONFLICT (organization_id, user_id)
              DO UPDATE SET role = memberships.role
              RETURNING *
            `,
            [createId("mbr"), organizationId, user.id],
          );
          membershipRows = insertedMembership.rows;
          repaired = true;
        }
        const selectedMembership = membershipRows.find((row) => row.organization_id === user.organizationId) || membershipRows[0];
        membership = rowToMembership(selectedMembership);
        const workspaceResult = await client.query("SELECT * FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE", [membership.organizationId]);
        workspace = workspaceResult.rows[0] ? rowToOrganization(workspaceResult.rows[0]) : null;

        let patientResult = user.patientId
          ? await client.query(
              `
                SELECT * FROM patients
                WHERE id = $1 AND deleted_at IS NULL
                  AND (account_user_id = $2 OR owner_user_id = $2)
                LIMIT 1 FOR UPDATE
              `,
              [user.patientId, user.id],
            )
          : { rows: [] };
        if (!patientResult.rows[0]) {
          patientResult = await client.query(
            `
              SELECT * FROM patients
              WHERE deleted_at IS NULL
                AND (account_user_id = $1 OR (owner_user_id = $1 AND (profile_type = 'self' OR relationship = 'self')))
              ORDER BY created_at ASC
              LIMIT 1 FOR UPDATE
            `,
            [user.id],
          );
        }
        if (patientResult.rows[0]) {
          patient = rowToPatient(patientResult.rows[0]);
        } else {
          patient = buildRepositorySelfPatient(user, membership.organizationId);
          await queryUpsertPatient(client, patient);
          repaired = true;
        }
        patient.ownerUserId = user.id;
        patient.accountUserId = user.id;
        patient.profileType = "self";
        patient.relationship = "self";
        await queryUpsertPatient(client, patient);
        const activePatientId = user.activePatientId || patient.id;
        const updatedUser = await client.query(
          `
            UPDATE users
            SET organization_id = $2,
                patient_id = $3,
                firebase_claims = jsonb_set(
                  COALESCE(firebase_claims, '{}'::jsonb),
                  '{profile}',
                  COALESCE(firebase_claims->'profile', '{}'::jsonb) || jsonb_build_object('activePatientId', $4::text),
                  true
                ),
                updated_at = now()
            WHERE id = $1
            RETURNING *
          `,
          [user.id, membership.organizationId, patient.id, activePatientId],
        );
        user = rowToUser(updatedUser.rows[0]);
        await client.query(
          "UPDATE organizations SET owner_user_id = COALESCE(owner_user_id, $2), updated_at = now() WHERE id = $1 AND workspace_type = 'personal'",
          [membership.organizationId, user.id],
        );
      }

      const linked = !previousFirebaseUid;
      let auditLog = null;
      if (created || linked || repaired) {
        auditLog = createAuditLog({
          action: created ? "account.firebase.onboard" : "account.firebase.reconcile",
          actorUserId: user.id,
          organizationId: user.organizationId || "",
          resourceType: "user",
          resourceId: user.id,
          ip: input.ip || "",
          userAgent: input.userAgent || "",
          metadata: { created, linked, repaired },
        });
        await queryInsertAuditLog(client, auditLog);
      }
      return { user, workspace, membership, patient, auditLog, created, repaired };
    });

    syncArrayItem(runtimeDb.users, result.user);
    if (result.workspace) syncArrayItem(runtimeDb.organizations, result.workspace);
    if (result.membership) syncArrayItem(runtimeDb.memberships, result.membership);
    if (result.patient) syncArrayItem(runtimeDb.patients, result.patient);
    if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
    await saveDb();
    return result;
  }

  async function queryDeleteUserGraph(client, userId, auditInput = null) {
    const id = String(userId || "");
    await queryLockWorkspaceOwnerMutation(client);
    const deletingUser = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE", [id]);
    if (!deletingUser.rows[0]) return null;
    const user = rowToUser(deletingUser.rows[0]);
    await queryAssertWorkspaceOwnerTransition(client, id, "delete");
    const identityAliases = [id, user.firebaseUid].filter(Boolean);
    await client.query("DELETE FROM notification_devices WHERE user_id = $1", [id]);
    await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
    await client.query("DELETE FROM memberships WHERE user_id = $1", [id]);
    await client.query(
      "DELETE FROM doctor_patient_access WHERE doctor_user_id = ANY($1::text[]) OR doctor_id = ANY($1::text[])",
      [identityAliases],
    );
    await client.query("UPDATE doctor_patient_access SET granted_by_user_id = NULL WHERE granted_by_user_id = $1", [id]);
    await client.query("UPDATE doctor_patient_access SET revoked_by_user_id = NULL WHERE revoked_by_user_id = $1", [id]);
    await client.query("UPDATE device_claims SET created_by_user_id = NULL WHERE created_by_user_id = $1", [id]);
    await client.query("UPDATE device_claims SET claimed_by_user_id = NULL WHERE claimed_by_user_id = $1", [id]);
    await client.query("UPDATE devices SET paired_user_id = NULL WHERE paired_user_id = $1", [id]);
    await client.query("UPDATE organizations SET owner_user_id = NULL WHERE owner_user_id = $1", [id]);
    if (user.role === "patient") {
      await client.query(
        `
          UPDATE patients
          SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
          WHERE account_user_id = $1
             OR (owner_user_id = $1 AND profile_type IN ('self', 'dependent'))
        `,
        [id],
      );
    }
    await client.query(
      `
        UPDATE patients
        SET owner_user_id = NULLIF(owner_user_id, $1),
            guardian_user_id = NULLIF(guardian_user_id, $1),
            account_user_id = NULLIF(account_user_id, $1),
            primary_doctor_id = NULLIF(primary_doctor_id, $1),
            updated_at = now()
        WHERE owner_user_id = $1 OR guardian_user_id = $1 OR account_user_id = $1 OR primary_doctor_id = $1
      `,
      [id],
    );
    await client.query("UPDATE scan_sessions SET created_by_user_id = NULL WHERE created_by_user_id = $1", [id]);
    await client.query("UPDATE appointments SET doctor_user_id = NULL WHERE doctor_user_id = $1", [id]);
    await client.query("UPDATE appointments SET created_by_user_id = NULL WHERE created_by_user_id = $1", [id]);
    await client.query("UPDATE appointments SET rescheduled_by_user_id = NULL WHERE rescheduled_by_user_id = $1", [id]);
    await client.query("UPDATE notifications SET user_id = NULL WHERE user_id = $1", [id]);
    // audit_logs are append-only. actor_user_id remains as an immutable identifier
    // after account deletion; migration 016 removes the incompatible users FK.
    if (auditInput) {
      await queryInsertAuditLog(client, createAuditLog({
        ...auditInput,
        resourceType: auditInput.resourceType || "user",
        resourceId: auditInput.resourceId || id,
      }));
    }
    const deleted = await client.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    return deleted.rows[0] ? user : null;
  }

  const users = {
    resolveFirebaseIdentityGraph,

    async beginManagedAdminCreate(input = {}) {
      const candidate = { ...objectOf(input.user) };
      const idempotency = normalizeMutationIdempotency(input.idempotency);
      const normalizedEmail = String(candidate.email || "").trim().toLowerCase();
      if (!candidate.id || !normalizedEmail || !candidate.organizationId || !idempotency) {
        throw repositoryError(
          400,
          "MANAGED_ADMIN_CREATE_INVALID",
          "Managed admin creation requires a user, workspace, and Idempotency-Key",
        );
      }
      candidate.email = normalizedEmail;
      const initialReservation = {
        state: "provider_pending",
        operationId: String(input.operationId || createId("admin_create")),
        userId: candidate.id,
        providerUid: String(input.providerUid || `firebase_${candidate.id}`),
        email: normalizedEmail,
        role: String(candidate.role || ""),
        organizationId: candidate.organizationId,
      };

      if (!getPool()) {
        return runManagedAdminCreateExclusive(async () => {
          const runtimeDb = getDb();
          const snapshot = snapshotRuntimeDb(runtimeDb);
          try {
            const existing = findRuntimeIdempotency(idempotency);
            if (existing) {
              assertIdempotencyFingerprint(existing, idempotency);
              existing.lastSeenAt = nowIso();
              const reservation = objectOf(existing.responseResource);
              const existingUser = reservation.userId
                ? (runtimeDb.users || []).find((user) => user.id === reservation.userId) || null
                : null;
              if (["activation_pending", "completed"].includes(reservation.state) && !existingUser) {
                throw repositoryError(
                  409,
                  "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
                  "Managed admin idempotency record is complete but its backend user is missing",
                );
              }
              return { reservation, user: existingUser, replayed: true };
            }
            const conflict = (runtimeDb.users || []).find(
              (user) =>
                user.id === candidate.id ||
                String(user.email || "").trim().toLowerCase() === normalizedEmail,
            );
            if (conflict) {
              throw repositoryError(409, "MANAGED_ADMIN_EMAIL_CONFLICT", "Managed admin email already exists");
            }
            const workspace = (runtimeDb.organizations || []).find(
              (organization) => organization.id === candidate.organizationId,
            ) || null;
            if (!workspace) {
              throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Managed admin workspace does not exist");
            }
            assertActiveManagedAdminWorkspace(candidate.role, workspace);
            syncRuntimeMutationIdempotency(
              idempotency,
              "managed_admin_create",
              candidate.id,
              202,
              initialReservation,
            );
            await saveDb();
            return { reservation: initialReservation, user: null, replayed: false };
          } catch (error) {
            restoreRuntimeDb(runtimeDb, snapshot);
            throw error;
          }
        });
      }

      const result = await withSqlTransaction(async (client) => {
        const replay = await findSqlMutationReplay(client, idempotency);
        if (replay) {
          const reservation = objectOf(replay.response_json);
          const selected = reservation.userId
            ? await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [reservation.userId])
            : { rows: [] };
          const existingUser = selected.rows[0] ? rowToUser(selected.rows[0]) : null;
          if (["activation_pending", "completed"].includes(reservation.state) && !existingUser) {
            throw repositoryError(
              409,
              "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
              "Managed admin idempotency record is complete but its backend user is missing",
            );
          }
          return { reservation, user: existingUser, replayed: true };
        }
        const workspace = await client.query(
          "SELECT id, status, workspace_type, type FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
          [candidate.organizationId],
        );
        if (!workspace.rows[0]) {
          throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Managed admin workspace does not exist");
        }
        assertActiveManagedAdminWorkspace(candidate.role, workspace.rows[0]);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `managed-admin-email:${normalizedEmail}`,
        ]);
        const conflict = await client.query(
          "SELECT id FROM users WHERE id = $1 OR lower(email) = lower($2) LIMIT 1 FOR UPDATE",
          [candidate.id, normalizedEmail],
        );
        if (conflict.rows[0]) {
          throw repositoryError(409, "MANAGED_ADMIN_EMAIL_CONFLICT", "Managed admin email already exists");
        }
        await insertSqlMutationIdempotency(
          client,
          idempotency,
          "managed_admin_create",
          candidate.id,
          202,
          initialReservation,
        );
        return { reservation: initialReservation, user: null, replayed: false };
      });
      syncRuntimeMutationIdempotency(
        idempotency,
        "managed_admin_create",
        result.reservation.userId,
        result.reservation.state === "completed" ? 201 : 202,
        result.reservation,
      );
      if (result.user) syncArrayItem(getDb().users, result.user);
      try {
        await saveDb();
      } catch (error) {
        error.backendCommitted = true;
        throw error;
      }
      return result;
    },

    async createManagedAdminWithAudit(input = {}) {
      const candidate = { ...objectOf(input.user) };
      const idempotency = normalizeMutationIdempotency(input.idempotency);
      const normalizedEmail = String(candidate.email || "").trim().toLowerCase();
      if (!candidate.id || !candidate.firebaseUid || !normalizedEmail || !candidate.organizationId || !idempotency) {
        throw repositoryError(
          400,
          "MANAGED_ADMIN_CREATE_INVALID",
          "Managed admin provider identity and idempotency reservation are required",
        );
      }
      candidate.email = normalizedEmail;
      // A backend row must not become authenticatable or count toward
      // last-admin invariants until the provider identity is enabled and
      // strictly verified. Activation is finalized by the separate durable
      // confirmation step below.
      candidate.accountStatus = "provisioning_pending";

      const buildActivationPendingResponse = (reservation, activationOperationId) => ({
        ...reservation,
        state: "activation_pending",
        userId: candidate.id,
        firebaseUid: candidate.firebaseUid,
        providerActivationStatus: "pending",
        activationOperationId,
        backendCommittedAt: nowIso(),
      });
      const buildAuditLog = () => createAuditLog({
        ...objectOf(input.auditInput),
        action: objectOf(input.auditInput).action || "admin.user.create",
        organizationId: candidate.organizationId,
        resourceType: "user",
        resourceId: candidate.id,
      });

      if (!getPool()) {
        return runManagedAdminCreateExclusive(async () => {
          const runtimeDb = getDb();
          const snapshot = snapshotRuntimeDb(runtimeDb);
          try {
            const existing = findRuntimeIdempotency(idempotency);
            if (!existing) {
              throw repositoryError(
                409,
                "MANAGED_ADMIN_CREATE_RESERVATION_REQUIRED",
                "Managed admin creation must be reserved before provider provisioning",
              );
            }
            assertIdempotencyFingerprint(existing, idempotency);
            const reservation = objectOf(existing.responseResource);
            if (["activation_pending", "completed"].includes(reservation.state)) {
              const replayUser = (runtimeDb.users || []).find((user) => user.id === reservation.userId) || null;
              if (!replayUser || replayUser.firebaseUid !== reservation.firebaseUid) {
                throw repositoryError(
                  409,
                  "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
                  "Completed managed admin identity no longer matches its provider account",
                );
              }
              return { user: replayUser, membership: null, auditLog: null, reservation, replayed: true };
            }
            if (
              reservation.state !== "provider_pending" ||
              reservation.userId !== candidate.id ||
              String(reservation.email || "").toLowerCase() !== normalizedEmail ||
              String(reservation.role || "") !== String(candidate.role || "") ||
              String(reservation.organizationId || "") !== String(candidate.organizationId || "")
            ) {
              throw repositoryError(
                409,
                "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
                "Managed admin reservation does not match the provider identity",
              );
            }
            const workspace = (runtimeDb.organizations || []).find(
              (organization) => organization.id === candidate.organizationId,
            ) || null;
            if (!workspace) {
              throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Managed admin workspace does not exist");
            }
            assertActiveManagedAdminWorkspace(candidate.role, workspace);
            const conflict = (runtimeDb.users || []).find(
              (user) =>
                user.id === candidate.id ||
                String(user.email || "").trim().toLowerCase() === normalizedEmail ||
                user.firebaseUid === candidate.firebaseUid,
            );
            if (conflict) {
              throw repositoryError(409, "MANAGED_ADMIN_IDENTITY_CONFLICT", "Managed admin identity already exists");
            }
            const membership = ["admin", "platform_admin"].includes(candidate.role)
              ? null
              : {
                  id: createId("mbr"),
                  organizationId: candidate.organizationId,
                  userId: candidate.id,
                  role: candidate.role || "workspace_admin",
                  createdAt: nowIso(),
                };
            const auditLog = buildAuditLog();
            const activationOperationId = `identityop_${reservation.operationId}`;
            runtimeDb.identityOperations = Array.isArray(runtimeDb.identityOperations) ? runtimeDb.identityOperations : [];
            const unresolved = runtimeDb.identityOperations.find(
              (item) =>
                item.targetUserId === candidate.id &&
                ["pending_provider", "provider_applied", "provider_failed"].includes(item.status),
            );
            if (unresolved) {
              throw repositoryError(
                409,
                "IDENTITY_OPERATION_IN_PROGRESS",
                "Another identity operation prevents managed-admin activation",
              );
            }
            const activationOperation = {
              id: activationOperationId,
              targetUserId: candidate.id,
              actorUserId: String(objectOf(input.auditInput).actorUserId || ""),
              organizationId: candidate.organizationId,
              operation: "managed_admin_activate",
              status: "pending_provider",
              idempotencyKey: idempotency.key,
              requestFingerprint: idempotency.fingerprint,
              previousAccountStatus: "provisioning_pending",
              targetAccountStatus: "active",
              targetState: {
                email: normalizedEmail,
                role: candidate.role,
                organizationId: candidate.organizationId,
                firebaseUid: candidate.firebaseUid,
              },
              providerStatus: "pending",
              providerResult: {},
              errorCode: "",
              createdAt: nowIso(),
              updatedAt: nowIso(),
              completedAt: "",
            };
            const activationPending = buildActivationPendingResponse(reservation, activationOperationId);
            syncArrayItem(runtimeDb.users, candidate);
            if (membership) syncArrayItem(runtimeDb.memberships, membership);
            runtimeDb.identityOperations.unshift(activationOperation);
            syncRuntimeAuditLog(auditLog);
            syncRuntimeMutationIdempotency(
              idempotency,
              "managed_admin_create",
              candidate.id,
              202,
              activationPending,
            );
            await saveDb();
            return {
              user: candidate,
              membership,
              auditLog,
              identityOperation: activationOperation,
              reservation: activationPending,
              replayed: false,
            };
          } catch (error) {
            restoreRuntimeDb(runtimeDb, snapshot);
            throw error;
          }
        });
      }

      const result = await withSqlTransaction(async (client) => {
        const replay = await findSqlMutationReplay(client, idempotency);
        if (!replay) {
          throw repositoryError(
            409,
            "MANAGED_ADMIN_CREATE_RESERVATION_REQUIRED",
            "Managed admin creation must be reserved before provider provisioning",
          );
        }
        const reservation = objectOf(replay.response_json);
        if (["activation_pending", "completed"].includes(reservation.state)) {
          const selected = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [reservation.userId]);
          const replayUser = selected.rows[0] ? rowToUser(selected.rows[0]) : null;
          if (!replayUser || replayUser.firebaseUid !== reservation.firebaseUid) {
            throw repositoryError(
              409,
              "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
              "Completed managed admin identity no longer matches its provider account",
            );
          }
          return { user: replayUser, membership: null, auditLog: null, reservation, replayed: true };
        }
        if (
          reservation.state !== "provider_pending" ||
          reservation.userId !== candidate.id ||
          String(reservation.email || "").toLowerCase() !== normalizedEmail ||
          String(reservation.role || "") !== String(candidate.role || "") ||
          String(reservation.organizationId || "") !== String(candidate.organizationId || "")
        ) {
          throw repositoryError(
            409,
            "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
            "Managed admin reservation does not match the provider identity",
          );
        }
        const workspace = await client.query(
          "SELECT id, status, workspace_type, type FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
          [candidate.organizationId],
        );
        if (!workspace.rows[0]) {
          throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Managed admin workspace does not exist");
        }
        assertActiveManagedAdminWorkspace(candidate.role, workspace.rows[0]);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `identity-operation:${candidate.id}`,
        ]);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `managed-admin-email:${normalizedEmail}`,
        ]);
        const unresolved = await client.query(
          `
            SELECT id, operation
            FROM identity_operations
            WHERE target_user_id = $1
              AND status IN ('pending_provider', 'provider_applied', 'provider_failed')
            LIMIT 1
            FOR UPDATE
          `,
          [candidate.id],
        );
        if (unresolved.rows[0]) {
          throw repositoryError(
            409,
            "IDENTITY_OPERATION_IN_PROGRESS",
            "Another identity operation prevents managed-admin activation",
          );
        }
        const conflict = await client.query(
          `
            SELECT id FROM users
            WHERE id = $1 OR lower(email) = lower($2) OR firebase_uid = $3
            LIMIT 1 FOR UPDATE
          `,
          [candidate.id, normalizedEmail, candidate.firebaseUid],
        );
        if (conflict.rows[0]) {
          throw repositoryError(409, "MANAGED_ADMIN_IDENTITY_CONFLICT", "Managed admin identity already exists");
        }
        const inserted = await client.query(
          `
            INSERT INTO users (
              id, firebase_uid, email, phone, role, name, password_hash, license, hospital, department,
              address, organization_id, patient_id, verified_email, verified_phone, account_status,
              requested_role, role_request_status, role_requested_at, role_approved_at, role_rejected_at,
              role_reject_reason, role_info_request_at, role_info_request_message, firebase_claims,
              created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL,
              $13, $14, $15, $16, $17, $18, $19, NULL, NULL, NULL, NULL, $20::jsonb,
              COALESCE($21::timestamptz, now()), now()
            )
            RETURNING *
          `,
          [
            candidate.id,
            candidate.firebaseUid,
            normalizedEmail,
            optional(candidate.phone),
            candidate.role || "workspace_admin",
            candidate.name || normalizedEmail,
            optional(candidate.passwordHash || candidate.password),
            optional(candidate.license),
            optional(candidate.hospital),
            optional(candidate.department),
            optional(candidate.address),
            candidate.organizationId,
            Boolean(candidate.verifiedEmail),
            Boolean(candidate.verifiedPhone),
            candidate.accountStatus || "active",
            optional(candidate.requestedRole),
            optional(candidate.roleRequestStatus),
            optionalTimestamp(candidate.roleRequestedAt),
            optionalTimestamp(candidate.roleApprovedAt),
            JSON.stringify(firebaseClaimsForUser(candidate)),
            optionalTimestamp(candidate.createdAt),
          ],
        );
        const persistedUser = rowToUser(inserted.rows[0]);
        const membership = ["admin", "platform_admin"].includes(candidate.role)
          ? null
          : {
              id: createId("mbr"),
              organizationId: candidate.organizationId,
              userId: candidate.id,
              role: candidate.role || "workspace_admin",
              createdAt: nowIso(),
            };
        let persistedMembership = null;
        if (membership) {
          const insertedMembership = await client.query(
            `
              INSERT INTO memberships (id, organization_id, user_id, role, created_at)
              VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
              RETURNING *
            `,
            [membership.id, membership.organizationId, membership.userId, membership.role, membership.createdAt],
          );
          persistedMembership = rowToMembership(insertedMembership.rows[0]);
        }
        const auditLog = buildAuditLog();
        await queryInsertAuditLog(client, auditLog);
        const activationOperationId = `identityop_${reservation.operationId}`;
        const insertedActivationOperation = await client.query(
          `
            INSERT INTO identity_operations (
              id, target_user_id, actor_user_id, organization_id, operation, status,
              idempotency_key, request_fingerprint, previous_account_status,
              target_account_status, target_state, provider_status, provider_result,
              created_at, updated_at
            )
            VALUES (
              $1, $2, NULLIF($3, ''), $4, 'managed_admin_activate', 'pending_provider',
              $5, $6, 'provisioning_pending', 'active', $7::jsonb, 'pending', '{}'::jsonb,
              now(), now()
            )
            RETURNING *
          `,
          [
            activationOperationId,
            candidate.id,
            String(objectOf(input.auditInput).actorUserId || ""),
            candidate.organizationId,
            idempotency.key,
            idempotency.fingerprint,
            JSON.stringify({
              email: normalizedEmail,
              role: candidate.role,
              organizationId: candidate.organizationId,
              firebaseUid: candidate.firebaseUid,
            }),
          ],
        );
        const activationPending = buildActivationPendingResponse(reservation, activationOperationId);
        await client.query(
          `
            UPDATE mutation_idempotency
            SET resource_type = 'managed_admin_create', resource_id = $4,
                response_status = 202, response_json = $5::jsonb, updated_at = now()
            WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
          `,
          [idempotency.scope, idempotency.operation, idempotency.key, candidate.id, JSON.stringify(activationPending)],
        );
        return {
          user: persistedUser,
          membership: persistedMembership,
          auditLog,
          identityOperation: rowToIdentityOperation(insertedActivationOperation.rows[0]),
          reservation: activationPending,
          replayed: false,
        };
      });
      syncArrayItem(getDb().users, result.user);
      if (result.membership) syncArrayItem(getDb().memberships, result.membership);
      if (result.identityOperation) {
        getDb().identityOperations = Array.isArray(getDb().identityOperations) ? getDb().identityOperations : [];
        syncArrayItem(getDb().identityOperations, result.identityOperation);
      }
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(
        idempotency,
        "managed_admin_create",
        result.user.id,
        result.reservation.state === "completed" ? 201 : 202,
        result.reservation,
      );
      try {
        await saveDb();
      } catch (error) {
        error.backendCommitted = true;
        throw error;
      }
      return result;
    },

    async confirmManagedAdminProviderActivation(input = {}) {
      const idempotency = normalizeMutationIdempotency(input.idempotency);
      const userId = String(input.userId || "");
      const firebaseUid = String(input.firebaseUid || "");
      const operationId = String(input.operationId || "");
      if (!idempotency || !userId || !firebaseUid || !operationId) {
        throw repositoryError(
          400,
          "MANAGED_ADMIN_ACTIVATION_INVALID",
          "Managed admin activation confirmation context is incomplete",
        );
      }

      const assertCanonical = (reservation, user, expectedAccountStatus) => {
        const driftFields = [];
        if (!user) driftFields.push("user");
        if (String(reservation.userId || "") !== userId || String(user?.id || "") !== userId) driftFields.push("userId");
        if (
          String(reservation.firebaseUid || "") !== firebaseUid ||
          String(user?.firebaseUid || "") !== firebaseUid
        ) driftFields.push("firebaseUid");
        if (String(reservation.activationOperationId || "") !== operationId) driftFields.push("activationOperationId");
        if (String(user?.email || "").trim().toLowerCase() !== String(reservation.email || "").trim().toLowerCase()) {
          driftFields.push("email");
        }
        if (String(user?.role || "") !== String(reservation.role || "")) driftFields.push("role");
        if (String(user?.organizationId || "") !== String(reservation.organizationId || "")) {
          driftFields.push("organizationId");
        }
        if (String(user?.accountStatus || "active") !== expectedAccountStatus) driftFields.push("accountStatus");
        if (driftFields.length > 0) {
          throw repositoryError(
            409,
            "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
            "Managed admin activation no longer matches canonical backend identity state",
            { driftFields: [...new Set(driftFields)] },
          );
        }
      };
      const completedReservation = (reservation) => ({
        ...reservation,
        state: "completed",
        providerActivationStatus: "confirmed",
        activatedAt: nowIso(),
        completedAt: nowIso(),
      });

      if (!getPool()) {
        return runManagedAdminCreateExclusive(async () => {
          const runtimeDb = getDb();
          const snapshot = snapshotRuntimeDb(runtimeDb);
          try {
            const existing = findRuntimeIdempotency(idempotency);
            if (!existing) {
              throw repositoryError(409, "MANAGED_ADMIN_CREATE_RESERVATION_REQUIRED", "Managed admin reservation is missing");
            }
            assertIdempotencyFingerprint(existing, idempotency);
            const reservation = objectOf(existing.responseResource);
            const user = (runtimeDb.users || []).find((item) => item.id === userId) || null;
            if (reservation.state === "completed") {
              if (reservation.providerActivationStatus !== "confirmed") {
                throw repositoryError(
                  409,
                  "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
                  "Completed managed admin activation is missing durable provider confirmation",
                );
              }
              assertCanonical(reservation, user, "active");
              return { user, reservation, identityOperation: null, auditLog: null, replayed: true };
            }
            if (reservation.state !== "activation_pending" || reservation.providerActivationStatus !== "pending") {
              throw repositoryError(
                409,
                "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
                "Managed admin provider activation is not durably pending",
              );
            }
            assertCanonical(reservation, user, "provisioning_pending");
            runtimeDb.identityOperations = Array.isArray(runtimeDb.identityOperations) ? runtimeDb.identityOperations : [];
            const identityOperation = runtimeDb.identityOperations.find((item) => item.id === operationId) || null;
            if (
              !identityOperation ||
              identityOperation.targetUserId !== userId ||
              identityOperation.operation !== "managed_admin_activate" ||
              identityOperation.status !== "pending_provider"
            ) {
              throw repositoryError(
                409,
                "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
                "Managed admin activation identity lock is missing or no longer pending",
              );
            }
            user.accountStatus = "active";
            user.updatedAt = nowIso();
            identityOperation.status = "completed";
            identityOperation.providerStatus = "enabled_verified";
            identityOperation.providerResult = { firebaseUid, disabled: false, verified: true };
            identityOperation.errorCode = "";
            identityOperation.updatedAt = nowIso();
            identityOperation.completedAt = nowIso();
            const completed = completedReservation(reservation);
            const auditLog = createAuditLog({
              actorUserId: identityOperation.actorUserId,
              organizationId: identityOperation.organizationId,
              action: "identity.managed_admin_activate.completed",
              resourceType: "user",
              resourceId: userId,
              metadata: { operationId, firebaseUid },
            });
            syncRuntimeAuditLog(auditLog);
            syncRuntimeMutationIdempotency(idempotency, "managed_admin_create", userId, 201, completed);
            await saveDb();
            return { user, reservation: completed, identityOperation, auditLog, replayed: false };
          } catch (error) {
            restoreRuntimeDb(runtimeDb, snapshot);
            throw error;
          }
        });
      }

      const result = await withSqlTransaction(async (client) => {
        const replay = await findSqlMutationReplay(client, idempotency);
        if (!replay) {
          throw repositoryError(409, "MANAGED_ADMIN_CREATE_RESERVATION_REQUIRED", "Managed admin reservation is missing");
        }
        const reservation = objectOf(replay.response_json);
        if (["admin", "platform_admin"].includes(String(reservation.role || ""))) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["identity-operation:platform-admin-guard"]);
        }
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`identity-operation:${userId}`]);
        const selectedUser = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE", [userId]);
        let user = selectedUser.rows[0] ? rowToUser(selectedUser.rows[0]) : null;
        if (reservation.state === "completed") {
          if (reservation.providerActivationStatus !== "confirmed") {
            throw repositoryError(
              409,
              "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
              "Completed managed admin activation is missing durable provider confirmation",
            );
          }
          assertCanonical(reservation, user, "active");
          return { user, reservation, identityOperation: null, auditLog: null, replayed: true };
        }
        if (reservation.state !== "activation_pending" || reservation.providerActivationStatus !== "pending") {
          throw repositoryError(
            409,
            "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
            "Managed admin provider activation is not durably pending",
          );
        }
        assertCanonical(reservation, user, "provisioning_pending");
        const selectedOperation = await client.query(
          "SELECT * FROM identity_operations WHERE id = $1 LIMIT 1 FOR UPDATE",
          [operationId],
        );
        let identityOperation = selectedOperation.rows[0] ? rowToIdentityOperation(selectedOperation.rows[0]) : null;
        if (
          !identityOperation ||
          identityOperation.targetUserId !== userId ||
          identityOperation.operation !== "managed_admin_activate" ||
          identityOperation.status !== "pending_provider"
        ) {
          throw repositoryError(
            409,
            "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
            "Managed admin activation identity lock is missing or no longer pending",
          );
        }
        const updatedUser = await client.query(
          "UPDATE users SET account_status = 'active', updated_at = now() WHERE id = $1 RETURNING *",
          [userId],
        );
        user = rowToUser(updatedUser.rows[0]);
        const updatedOperation = await client.query(
          `
            UPDATE identity_operations
            SET status = 'completed', provider_status = 'enabled_verified',
                provider_result = $2::jsonb, error_code = NULL,
                completed_at = now(), updated_at = now()
            WHERE id = $1
            RETURNING *
          `,
          [operationId, JSON.stringify({ firebaseUid, disabled: false, verified: true })],
        );
        identityOperation = rowToIdentityOperation(updatedOperation.rows[0]);
        const completed = completedReservation(reservation);
        const auditLog = createAuditLog({
          actorUserId: identityOperation.actorUserId,
          organizationId: identityOperation.organizationId,
          action: "identity.managed_admin_activate.completed",
          resourceType: "user",
          resourceId: userId,
          metadata: { operationId, firebaseUid },
        });
        await queryInsertAuditLog(client, auditLog);
        await client.query(
          `
            UPDATE mutation_idempotency
            SET resource_type = 'managed_admin_create', resource_id = $4,
                response_status = 201, response_json = $5::jsonb, updated_at = now()
            WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
          `,
          [idempotency.scope, idempotency.operation, idempotency.key, userId, JSON.stringify(completed)],
        );
        return { user, reservation: completed, identityOperation, auditLog, replayed: false };
      });
      syncArrayItem(getDb().users, result.user);
      getDb().identityOperations = Array.isArray(getDb().identityOperations) ? getDb().identityOperations : [];
      if (result.identityOperation) syncArrayItem(getDb().identityOperations, result.identityOperation);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(idempotency, "managed_admin_create", userId, 201, result.reservation);
      try {
        await saveDb();
      } catch (error) {
        error.backendCommitted = true;
        throw error;
      }
      return result;
    },

    async save(user) {
      user.updatedAt = nowIso();
      syncArrayItem(getDb().users, user);
      await upsertUserSql(user);
      await saveDb();
      return user;
    },

    async updateAccountProfile(identifier, patch = {}) {
      const id = String(identifier || "");
      const hasSql = Boolean(getPool());
      const sqlUser = await withSql((pool) => queryUpdateAccountProfile(pool, id, patch));
      if (hasSql && !sqlUser) {
        return null;
      }

      const user = sqlUser
        ? syncArrayItem(getDb().users, sqlUser)
        : getDb().users.find(
            (item) =>
              item.id === id ||
              item.firebaseUid === id ||
              String(item.email || "").toLowerCase() === id.toLowerCase()
          );
      if (!user) {
        return null;
      }
      Object.assign(user, patch, { updatedAt: nowIso() });
      syncArrayItem(getDb().users, user);
      await saveDb();
      return user;
    },

    async updateAccountProfileWithAudit(identifier, patch = {}, auditInput = {}, idempotencyInput = null) {
      const id = String(identifier || "");
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      const runtimeUser = getDb().users.find(
        (item) => item.id === id || item.firebaseUid === id || String(item.email || "").toLowerCase() === id.toLowerCase(),
      );
      if (!runtimeUser) return null;
      assertRuntimeAccountMutationAuthorization(auditInput.authorization, runtimeUser);
      const responseSnapshot = { id: runtimeUser.id };
      const auditLog = createAuditLog({
        ...auditInput,
        actorUserId: auditInput.actorUserId || runtimeUser.id,
        organizationId: auditInput.organizationId || patch.organizationId || runtimeUser.organizationId || "",
        resourceType: "user",
        resourceId: runtimeUser.id,
      });
      if (!getPool()) {
        const existing = idempotency ? findRuntimeIdempotency(idempotency) : null;
        if (existing) {
          assertIdempotencyFingerprint(existing, idempotency);
          existing.lastSeenAt = nowIso();
          return {
            user: runtimeUser,
            auditLog: null,
            replayed: true,
          };
        }
        Object.assign(runtimeUser, patch, { updatedAt: nowIso() });
        syncArrayItem(getDb().users, runtimeUser);
        syncRuntimeAuditLog(auditLog);
        syncRuntimeMutationIdempotency(
          idempotency,
          "user",
          runtimeUser.id,
          200,
          responseSnapshot,
        );
        await saveDb();
        return { user: runtimeUser, auditLog, replayed: false };
      }
      const result = await withSqlTransaction(async (client) => {
        await assertSqlAccountMutationAuthorization(client, auditInput.authorization, runtimeUser.id);
        const replay = await findSqlMutationReplay(client, idempotency);
        if (replay) {
          const current = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [runtimeUser.id]);
          return {
            user: current.rows[0] ? rowToUser(current.rows[0]) : null,
            auditLog: null,
            replayed: true,
          };
        }
        const persisted = await queryUpdateAccountProfile(client, id, patch);
        if (!persisted) return null;
        await queryInsertAuditLog(client, auditLog);
        await insertSqlMutationIdempotency(
          client,
          idempotency,
          "user",
          persisted.id,
          200,
          responseSnapshot,
        );
        return { user: persisted, auditLog, replayed: false };
      });
      if (!result || !result.user) return null;
      syncArrayItem(getDb().users, result.user);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(
        idempotency,
        "user",
        result.user.id,
        200,
        responseSnapshot,
      );
      await saveDb();
      return result;
    },

    async findByIdOrFirebaseUid(identifier) {
      const id = String(identifier || "");
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM users WHERE id = $1 OR firebase_uid = $1 LIMIT 1",
            [id],
          );
          const selected = result.rows
            .map(rowToUser)
            .find((user) => user.id === id || user.firebaseUid === id) || null;
          if (!selected) {
            getDb().users = getDb().users.filter(
              (user) => user.id !== id && user.firebaseUid !== id,
            );
            return null;
          }
          return syncArrayItem(getDb().users, selected);
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "IDENTITY_STORAGE_UNAVAILABLE", "Identity storage is unavailable");
        }
      }
      return getDb().users.find((user) => user.id === id || user.firebaseUid === id) || null;
    },

    async findByFirebaseUid(identifier) {
      const id = String(identifier || "");
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM users WHERE id = $1 OR firebase_uid = $1 LIMIT 1",
            [id],
          );
          const selected = result.rows
            .map(rowToUser)
            .find((user) => user.id === id || user.firebaseUid === id) || null;
          if (!selected) return null;
          return syncArrayItem(getDb().users, selected);
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "IDENTITY_STORAGE_UNAVAILABLE", "Identity storage is unavailable");
        }
      }
      return getDb().users.find((user) => user.id === id || user.firebaseUid === id) || null;
    },

    async findById(identifier) {
      const id = String(identifier || "");
      if (getPool()) {
        try {
          const result = await getPool().query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
          if (!result.rows[0]) return null;
          return syncArrayItem(getDb().users, rowToUser(result.rows[0]));
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "IDENTITY_STORAGE_UNAVAILABLE", "Identity storage is unavailable");
        }
      }
      return getDb().users.find((user) => user.id === id) || null;
    },

    async findByEmail(identifier) {
      const email = String(identifier || "").toLowerCase();
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1",
            [email],
          );
          if (!result.rows[0]) return null;
          return syncArrayItem(getDb().users, rowToUser(result.rows[0]));
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "IDENTITY_STORAGE_UNAVAILABLE", "Identity storage is unavailable");
        }
      }
      return getDb().users.find((user) => String(user.email || "").toLowerCase() === email) || null;
    },

    async listDoctorRequests(status) {
      const runtimeUsers = getDb()
        .users.filter((user) => matchesDoctorRequestStatus(user, status));
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
      if (sqlUsers) {
        for (const user of sqlUsers) {
          syncArrayItem(getDb().users, user);
        }
        return mergeSqlListWithRuntime(runtimeUsers, sqlUsers)
          .sort((a, b) => String(b.roleRequestedAt || b.createdAt || "").localeCompare(String(a.roleRequestedAt || a.createdAt || "")));
      }
      return runtimeUsers
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

    async deleteById(userId, options = {}) {
      const id = String(userId || "");
      if (!id) return false;

      if (!getPool()) {
        assertRuntimeWorkspaceOwnerTransition(getDb(), id, "delete");
      }

      let sqlDeletedUser = null;
      if (getPool()) {
        sqlDeletedUser = await withSqlTransaction(async (client) => {
          return queryDeleteUserGraph(client, id);
        });
        if (!sqlDeletedUser) return false;
      }

      const db = getDb();
      const cachedUser = db.users.find((item) => item.id === id);
      const user = sqlDeletedUser || cachedUser;
      if (!getPool() && !user) return false;
      db.users = db.users.filter((item) => item.id !== id);
      db.memberships = db.memberships.filter((item) => item.userId !== id);
      db.sessions = db.sessions.filter((item) => item.userId !== id);
      db.authSessions = db.authSessions.filter((item) => item.userId !== id);
      db.twoFactorCredentials = (db.twoFactorCredentials || []).filter((item) => item.userId !== id);
      db.twoFactorEnrollments = (db.twoFactorEnrollments || []).filter((item) => item.userId !== id);
      db.twoFactorChallenges = (db.twoFactorChallenges || []).filter((item) => item.userId !== id);
      db.twoFactorTokens = (db.twoFactorTokens || []).filter((item) => item.userId !== id);
      db.notificationDevices = (db.notificationDevices || []).filter((item) => item.userId !== id);
      const identityAliases = new Set([id, user.firebaseUid].filter(Boolean));
      db.doctorPatientAccess = (db.doctorPatientAccess || []).filter(
        (item) => !identityAliases.has(item.doctorUserId) && !identityAliases.has(item.doctorId),
      );
      for (const item of db.doctorPatientAccess) {
        if (item.grantedByUserId === id) item.grantedByUserId = "";
        if (item.revokedByUserId === id) item.revokedByUserId = "";
      }
      for (const item of db.deviceClaims || []) {
        if (item.createdByUserId === id) item.createdByUserId = "";
        if (item.claimedByUserId === id) item.claimedByUserId = "";
      }
      for (const item of db.devices || []) {
        if (item.pairedUserId === id) item.pairedUserId = "";
      }
      for (const item of db.organizations || []) {
        if (item.ownerUserId === id) item.ownerUserId = "";
      }
      for (const item of db.patients || []) {
        const isLegacySelfProfile = user?.role === "patient" && user.patientId && item.id === user.patientId;
        if (
          user?.role === "patient" &&
          (isLegacySelfProfile || item.accountUserId === id || (item.ownerUserId === id && ["self", "dependent"].includes(item.profileType)))
        ) {
          item.deletedAt = item.deletedAt || nowIso();
        }
        if (item.ownerUserId === id) item.ownerUserId = "";
        if (item.guardianUserId === id) item.guardianUserId = "";
        if (item.accountUserId === id) item.accountUserId = "";
        if (item.primaryDoctorId === id) item.primaryDoctorId = "";
      }
      for (const item of db.scans || []) {
        if (item.createdByUserId === id) item.createdByUserId = "";
      }
      for (const item of db.appointments || []) {
        if (item.doctorUserId === id) item.doctorUserId = "";
        if (item.createdByUserId === id) item.createdByUserId = "";
        if (item.rescheduledByUserId === id) item.rescheduledByUserId = "";
      }
      for (const item of db.notifications || []) {
        if (item.userId === id) item.userId = "";
      }
      for (const item of db.identityOperations || []) {
        if (item.actorUserId === id) item.actorUserId = "";
      }
      db.chatMessages = (db.chatMessages || []).filter((item) => item.userId !== id);
      if (!options.deferSave) await saveDb();
      return Boolean(sqlDeletedUser || user);
    },
  };

  const organizations = {
    async upsert(organization) {
      syncArrayItem(getDb().organizations, organization);
      await upsertOrganizationSql(organization);
      await saveDb();
      return organization;
    },

    async submitRequest(input = {}) {
      const actorUserId = String(input.actorUserId || "");
      const organizationId = String(input.organizationId || "");
      const idempotency = normalizeMutationIdempotency(input.idempotency);
      if (!actorUserId || !organizationId || !idempotency) {
        throw repositoryError(
          400,
          "WORKSPACE_REQUEST_INVALID",
          "Workspace request actor, organization and idempotency context are required",
        );
      }
      const payload = normalizeWorkspaceCreate({
        ...objectOf(input.payload),
        ownerUserId: actorUserId,
        status: "pending",
      });
      const responseStatus = 201;

      function assertRequestState(workspace) {
        if (!workspace) return;
        if (workspace.ownerUserId && workspace.ownerUserId !== actorUserId) {
          throw repositoryError(
            403,
            "WORKSPACE_REQUEST_OWNER_MISMATCH",
            "The workspace request belongs to another user",
          );
        }
        if (!["pending", "needs_info", "rejected"].includes(String(workspace.status || ""))) {
          throw repositoryError(
            409,
            "WORKSPACE_REQUEST_STATE_INVALID",
            "Only pending, needs_info or rejected workspace requests can be submitted",
            { currentStatus: workspace.status || "" },
          );
        }
      }

      if (getPool()) {
        const result = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `workspace-request:${actorUserId}`,
          ]);
          const replay = await findSqlMutationReplay(client, idempotency);
          if (replay) {
            return {
              ...objectOf(replay.response_json),
              replayed: true,
              auditLog: null,
            };
          }
          const selectedUser = await client.query(
            "SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
            [actorUserId],
          );
          if (!selectedUser.rows[0]) {
            throw repositoryError(404, "WORKSPACE_REQUEST_USER_NOT_FOUND", "Workspace request user was not found");
          }
          const currentUser = rowToUser(selectedUser.rows[0]);
          if (currentUser.role !== "patient") {
            throw repositoryError(
              409,
              "ROLE_TRANSITION_REQUIRES_ADMIN",
              "An operational account cannot submit a workspace request",
            );
          }
          const selectedWorkspace = await client.query(
            "SELECT * FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
            [organizationId],
          );
          const currentWorkspace = selectedWorkspace.rows[0]
            ? rowToOrganization(selectedWorkspace.rows[0])
            : null;
          assertRequestState(currentWorkspace);

          let workspaceRow;
          if (currentWorkspace) {
            const updated = await client.query(
              `
                UPDATE organizations
                SET name = $2, type = $3, workspace_type = $4,
                    address = NULLIF($5, ''), phone = NULLIF($6, ''),
                    email = NULLIF($7, ''), website = NULLIF($8, ''),
                    status = 'pending', legal_name = NULLIF($9, ''),
                    representative = NULLIF($10, ''), owner_user_id = $11,
                    request_metadata = $12::jsonb, version = version + 1,
                    deleted_at = NULL, updated_at = now()
                WHERE id = $1 AND version = $13
                RETURNING *
              `,
              [
                organizationId,
                payload.name,
                payload.type,
                payload.workspaceType,
                payload.address,
                payload.phone,
                payload.email,
                payload.website,
                payload.legalName,
                payload.representative,
                actorUserId,
                JSON.stringify(payload.requestMetadata),
                Number(currentWorkspace.version || 1),
              ],
            );
            if (!updated.rows[0]) {
              throw repositoryError(
                409,
                "WORKSPACE_VERSION_CONFLICT",
                "Workspace was changed by another operation",
              );
            }
            workspaceRow = updated.rows[0];
          } else {
            const inserted = await client.query(
              `
                INSERT INTO organizations (
                  id, name, type, workspace_type, address, phone, email, website,
                  status, legal_name, representative, owner_user_id, package_id,
                  subscription_status, billing_cycle, request_metadata, version,
                  deleted_at, created_at, updated_at
                )
                VALUES (
                  $1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''),
                  NULLIF($8, ''), 'pending', NULLIF($9, ''), NULLIF($10, ''), $11,
                  NULLIF($12, ''), $13, $14, $15::jsonb, 1, NULL, now(), now()
                )
                RETURNING *
              `,
              [
                organizationId,
                payload.name,
                payload.type,
                payload.workspaceType,
                payload.address,
                payload.phone,
                payload.email,
                payload.website,
                payload.legalName,
                payload.representative,
                actorUserId,
                payload.packageId,
                payload.subscriptionStatus,
                payload.billingCycle,
                JSON.stringify(payload.requestMetadata),
              ],
            );
            workspaceRow = inserted.rows[0];
          }
          const workspace = rowToOrganization(workspaceRow);
          const updatedUser = await client.query(
            `
              UPDATE users
              SET role = 'patient', requested_role = 'workspace_owner',
                  role_request_status = 'pending', role_requested_at = now(),
                  role_approved_at = NULL, role_rejected_at = NULL,
                  role_reject_reason = NULL, role_info_request_at = NULL,
                  role_info_request_message = NULL, organization_id = $2,
                  account_status = COALESCE(NULLIF(account_status, ''), 'active'),
                  firebase_claims = jsonb_set(
                    jsonb_set(
                      COALESCE(firebase_claims, '{}'::jsonb),
                      '{workspaceType}', to_jsonb($3::text), true
                    ),
                    '{roleInfoRequiredFields}', '[]'::jsonb, true
                  ),
                  updated_at = now()
              WHERE id = $1
              RETURNING *
            `,
            [actorUserId, organizationId, payload.workspaceType],
          );
          const user = rowToUser(updatedUser.rows[0]);
          const membershipResult = await client.query(
            `
              INSERT INTO memberships (
                id, organization_id, user_id, role, status, suspended_at, created_at, updated_at
              )
              VALUES ($1, $2, $3, 'patient', 'active', NULL, now(), now())
              ON CONFLICT (organization_id, user_id)
              DO UPDATE SET role = 'patient', status = 'active', suspended_at = NULL, updated_at = now()
              RETURNING *
            `,
            [createId("mbr"), organizationId, actorUserId],
          );
          const membership = rowToMembership(membershipResult.rows[0]);
          const operationId = createId("workspace_request_operation");
          const auditLog = createAuditLog({
            ...(input.audit || {}),
            actorUserId,
            organizationId,
            action: currentWorkspace ? "workspace.request.resubmit" : "workspace.request.create",
            resourceType: "organization",
            resourceId: organizationId,
            metadata: {
              ...objectOf(input.audit?.metadata),
              operationId,
              previousStatus: currentWorkspace?.status || "",
              version: workspace.version,
            },
          });
          await queryInsertAuditLog(client, auditLog);
          const response = {
            workspace: publicWorkspaceLifecycle(workspace),
            user,
            membership,
            operationId,
            idempotent: false,
          };
          await insertSqlMutationIdempotency(
            client,
            idempotency,
            "organization",
            organizationId,
            responseStatus,
            response,
          );
          return { ...response, replayed: false, auditLog };
        });
        if (result.workspace) syncArrayItem(getDb().organizations, result.workspace);
        if (result.user) syncArrayItem(getDb().users, result.user);
        if (result.membership) syncArrayItem(getDb().memberships, result.membership);
        if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
        await saveDb();
        return {
          ...result,
          idempotent: result.replayed === true,
          responseStatus,
        };
      }

      return runWorkspaceOwnerMutationExclusive(`request:${actorUserId}`, async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          runtimeDb.idempotencyKeys = Array.isArray(runtimeDb.idempotencyKeys)
            ? runtimeDb.idempotencyKeys
            : [];
          const replay = findRuntimeIdempotency(idempotency);
          assertIdempotencyFingerprint(replay, idempotency);
          if (replay) {
            return {
              ...cloneRuntimeValue(replay.responseResource),
              idempotent: true,
              replayed: true,
              responseStatus: Number(replay.responseStatus || responseStatus),
            };
          }
          const user = (runtimeDb.users || []).find((item) => item.id === actorUserId);
          if (!user) {
            throw repositoryError(404, "WORKSPACE_REQUEST_USER_NOT_FOUND", "Workspace request user was not found");
          }
          if (user.role !== "patient") {
            throw repositoryError(
              409,
              "ROLE_TRANSITION_REQUIRES_ADMIN",
              "An operational account cannot submit a workspace request",
            );
          }
          let workspace = (runtimeDb.organizations || []).find((item) => item.id === organizationId);
          const currentWorkspace = workspace ? { ...workspace } : null;
          assertRequestState(currentWorkspace);
          const changedAt = nowIso();
          if (workspace) {
            Object.assign(workspace, payload, {
              ownerUserId: actorUserId,
              status: "pending",
              version: Number(workspace.version || 1) + 1,
              deletedAt: "",
              updatedAt: changedAt,
            });
          } else {
            workspace = publicWorkspaceLifecycle({
              id: organizationId,
              ...payload,
              ownerUserId: actorUserId,
              status: "pending",
              version: 1,
              deletedAt: "",
              createdAt: changedAt,
              updatedAt: changedAt,
            });
            runtimeDb.organizations.unshift(workspace);
          }
          Object.assign(user, {
            role: "patient",
            requestedRole: "workspace_owner",
            roleRequestStatus: "pending",
            roleRequestedAt: changedAt,
            roleApprovedAt: "",
            roleRejectedAt: "",
            roleRejectReason: "",
            roleInfoRequestAt: "",
            roleInfoRequestMessage: "",
            roleInfoRequiredFields: [],
            organizationId,
            workspaceType: payload.workspaceType,
            accountStatus: user.accountStatus || "active",
            updatedAt: changedAt,
          });
          runtimeDb.memberships = Array.isArray(runtimeDb.memberships) ? runtimeDb.memberships : [];
          let membership = runtimeDb.memberships.find(
            (item) => item.organizationId === organizationId && item.userId === actorUserId,
          );
          if (!membership) {
            membership = {
              id: createId("mbr"),
              organizationId,
              userId: actorUserId,
              role: "patient",
              status: "active",
              suspendedAt: "",
              createdAt: changedAt,
              updatedAt: changedAt,
            };
            runtimeDb.memberships.push(membership);
          } else {
            Object.assign(membership, {
              role: "patient",
              status: "active",
              suspendedAt: "",
              updatedAt: changedAt,
            });
          }
          const operationId = createId("workspace_request_operation");
          const auditLog = createAuditLog({
            ...(input.audit || {}),
            actorUserId,
            organizationId,
            action: currentWorkspace ? "workspace.request.resubmit" : "workspace.request.create",
            resourceType: "organization",
            resourceId: organizationId,
            metadata: {
              ...objectOf(input.audit?.metadata),
              operationId,
              previousStatus: currentWorkspace?.status || "",
              version: workspace.version,
            },
          });
          const response = {
            workspace: publicWorkspaceLifecycle(workspace),
            user: cloneRuntimeValue(user),
            membership: cloneRuntimeValue(membership),
            operationId,
            idempotent: false,
          };
          syncRuntimeAuditLog(auditLog);
          syncRuntimeMutationIdempotency(
            idempotency,
            "organization",
            organizationId,
            responseStatus,
            response,
          );
          await saveDb();
          return { ...response, replayed: false, responseStatus, auditLog };
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },

    async beginOwnerTransfer(input = {}) {
      const organizationId = String(input.organizationId || "");
      const newOwnerUserId = String(input.newOwnerUserId || "");
      const actorUserId = String(input.actorUserId || "");
      const targetWorkspaceStatus = String(input.targetWorkspaceStatus || "");
      const idempotency = normalizeMutationIdempotency(input.idempotency);
      if (!organizationId || !newOwnerUserId || !actorUserId) {
        throw repositoryError(400, "WORKSPACE_OWNER_TRANSFER_INVALID", "Workspace owner transfer context is incomplete");
      }
      if (!idempotency) {
        throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required for workspace owner transfer");
      }
      if (targetWorkspaceStatus && targetWorkspaceStatus !== "active") {
        throw repositoryError(400, "WORKSPACE_STATUS_INVALID", "Owner identity finalization only supports active workspace status");
      }
      const auditAction = idempotency.operation === "workspace.owner.approval"
        ? "workspace.owner.approval"
        : "workspace.owner.transfer";
      const isOwnerApproval = idempotency.operation === "workspace.owner.approval";
      const expectedVersion = Number(input.expectedVersion);
      if (!isOwnerApproval && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
        throw repositoryError(
          400,
          "WORKSPACE_VERSION_REQUIRED",
          "A positive integer workspace version is required for owner transfer",
        );
      }

      if (getPool()) {
        const result = await withSqlTransaction(async (client) => {
          const replay = await findSqlMutationReplay(client, idempotency);
          await queryLockWorkspaceOwnerMutation(client);
          if (!replay) {
            const pendingTransfer = await client.query(
              `
                SELECT scope, operation, idempotency_key, response_json
                FROM mutation_idempotency
                WHERE operation IN ('workspace.owner.transfer', 'workspace.owner.approval')
                  AND resource_type = 'organization'
                  AND resource_id = $1
                  AND response_status = 202
                LIMIT 1
                FOR UPDATE
              `,
              [organizationId],
            );
            if (pendingTransfer.rows[0]) {
              throw repositoryError(
                409,
                "WORKSPACE_OWNER_TRANSFER_IN_PROGRESS",
                "Another workspace owner transfer must be completed or reconciled first",
              );
            }
          }
          const selectedOrganization = await client.query(
            "SELECT * FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
            [organizationId],
          );
          if (!selectedOrganization.rows[0]) {
            throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
          }
          const currentOrganization = rowToOrganization(selectedOrganization.rows[0]);
          if (!replay && !isOwnerApproval && Number(currentOrganization.version || 1) !== expectedVersion) {
            throw repositoryError(
              409,
              "WORKSPACE_VERSION_CONFLICT",
              "Workspace was changed by another operation",
              { expectedVersion, currentVersion: Number(currentOrganization.version || 1) },
            );
          }
          if (String(currentOrganization.workspaceType || currentOrganization.type || "clinic").toLowerCase() === "personal") {
            throw repositoryError(409, "PERSONAL_WORKSPACE_OWNER_IMMUTABLE", "A personal workspace cannot be transferred");
          }
          const selectedOwner = await client.query(
            "SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
            [newOwnerUserId],
          );
          if (!selectedOwner.rows[0]) {
            throw repositoryError(404, "WORKSPACE_OWNER_NOT_FOUND", "The replacement workspace owner was not found");
          }
          const replacementOwner = rowToUser(selectedOwner.rows[0]);
          if (!isActiveRuntimeUser(replacementOwner)) {
            throw repositoryError(409, "WORKSPACE_OWNER_NOT_ACTIVE", "The replacement workspace owner must be active");
          }
          const selectedMembership = await client.query(
            `
              SELECT *
              FROM memberships
              WHERE organization_id = $1 AND user_id = $2
              LIMIT 1
              FOR UPDATE
            `,
            [organizationId, newOwnerUserId],
          );
          const replacementMembership = selectedMembership.rows[0]
            ? rowToMembership(selectedMembership.rows[0])
            : null;
          const identityReady =
            replacementOwner.role === "workspace_owner" &&
            replacementOwner.requestedRole === "workspace_owner" &&
            replacementOwner.roleRequestStatus === "approved" &&
            replacementOwner.organizationId === organizationId &&
            replacementOwner.accountStatus === "active" &&
            replacementMembership?.role === "workspace_owner" &&
            String(replacementMembership.status || "active") === "active";
          if (replay) {
            return {
              ...objectOf(replay.response_json),
              organization: currentOrganization,
              replacementOwner,
              replacementMembership,
              requiresIdentityTransition: !identityReady,
              replayed: true,
              auditLog: null,
            };
          }
          const previousOwnerUserId = currentOrganization.ownerUserId || "";
          const reservation = {
            state: "pending_provider",
            operationId: createId("op"),
            organizationId,
            previousOwnerUserId,
            newOwnerUserId,
            identityOperationId: "",
            targetWorkspaceStatus,
            expectedVersion: isOwnerApproval ? Number(currentOrganization.version || 1) : expectedVersion,
          };
          const auditLog = createAuditLog({
            actorUserId,
            organizationId,
            action: `${auditAction}.intent`,
            resourceType: "organization",
            resourceId: organizationId,
            ip: input.ip || "",
            userAgent: input.userAgent || "",
            metadata: { previousOwnerUserId, newOwnerUserId },
          });
          await queryInsertAuditLog(client, auditLog);
          await insertSqlMutationIdempotency(
            client,
            idempotency,
            "organization",
            organizationId,
            202,
            reservation,
          );
          return {
            ...reservation,
            organization: currentOrganization,
            replacementOwner,
            replacementMembership,
            requiresIdentityTransition: !identityReady,
            auditLog,
            replayed: false,
          };
        });
        if (result.organization) syncArrayItem(getDb().organizations, result.organization);
        if (result.replacementOwner) syncArrayItem(getDb().users, result.replacementOwner);
        if (result.replacementMembership) syncArrayItem(getDb().memberships, result.replacementMembership);
        if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
        await saveDb();
        return result;
      }

      return runWorkspaceOwnerMutationExclusive(organizationId, async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          runtimeDb.idempotencyKeys = Array.isArray(runtimeDb.idempotencyKeys) ? runtimeDb.idempotencyKeys : [];
          const replay = findRuntimeIdempotency(idempotency);
          assertIdempotencyFingerprint(replay, idempotency);
          if (!replay) {
            const pendingTransfer = runtimeDb.idempotencyKeys.find(
              (entry) =>
                ["workspace.owner.transfer", "workspace.owner.approval"].includes(entry.operation) &&
                entry.resourceType === "organization" &&
                entry.resourceId === organizationId &&
                Number(entry.responseStatus) === 202,
            );
            if (pendingTransfer) {
              throw repositoryError(
                409,
                "WORKSPACE_OWNER_TRANSFER_IN_PROGRESS",
                "Another workspace owner transfer must be completed or reconciled first",
              );
            }
          }
          const organization = (runtimeDb.organizations || []).find((item) => item.id === organizationId);
          if (!organization) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
          if (String(organization.workspaceType || organization.type || "clinic").toLowerCase() === "personal") {
            throw repositoryError(409, "PERSONAL_WORKSPACE_OWNER_IMMUTABLE", "A personal workspace cannot be transferred");
          }
          if (!replay && !isOwnerApproval && Number(organization.version || 1) !== expectedVersion) {
            throw repositoryError(
              409,
              "WORKSPACE_VERSION_CONFLICT",
              "Workspace was changed by another operation",
              { expectedVersion, currentVersion: Number(organization.version || 1) },
            );
          }
          const replacementOwner = (runtimeDb.users || []).find((item) => item.id === newOwnerUserId);
          if (!replacementOwner) {
            throw repositoryError(404, "WORKSPACE_OWNER_NOT_FOUND", "The replacement workspace owner was not found");
          }
          if (!isActiveRuntimeUser(replacementOwner)) {
            throw repositoryError(409, "WORKSPACE_OWNER_NOT_ACTIVE", "The replacement workspace owner must be active");
          }
          const replacementMembership = (runtimeDb.memberships || []).find(
            (item) => item.organizationId === organizationId && item.userId === newOwnerUserId,
          ) || null;
          const identityReady =
            replacementOwner.role === "workspace_owner" &&
            replacementOwner.requestedRole === "workspace_owner" &&
            replacementOwner.roleRequestStatus === "approved" &&
            replacementOwner.organizationId === organizationId &&
            replacementOwner.accountStatus === "active" &&
            replacementMembership?.role === "workspace_owner" &&
            String(replacementMembership.status || "active") === "active";
          if (replay) {
            return {
              ...objectOf(replay.responseResource),
              organization: { ...organization },
              replacementOwner: { ...replacementOwner },
              replacementMembership: replacementMembership ? { ...replacementMembership } : null,
              requiresIdentityTransition: !identityReady,
              replayed: true,
              auditLog: null,
            };
          }
          const previousOwnerUserId = organization.ownerUserId || "";
          const reservation = {
            state: "pending_provider",
            operationId: createId("op"),
            organizationId,
            previousOwnerUserId,
            newOwnerUserId,
            identityOperationId: "",
            targetWorkspaceStatus,
            expectedVersion: isOwnerApproval ? Number(organization.version || 1) : expectedVersion,
          };
          const auditLog = createAuditLog({
            actorUserId,
            organizationId,
            action: `${auditAction}.intent`,
            resourceType: "organization",
            resourceId: organizationId,
            ip: input.ip || "",
            userAgent: input.userAgent || "",
            metadata: { previousOwnerUserId, newOwnerUserId },
          });
          syncRuntimeAuditLog(auditLog);
          syncRuntimeMutationIdempotency(idempotency, "organization", organizationId, 202, reservation);
          await saveDb();
          return {
            ...reservation,
            organization: { ...organization },
            replacementOwner: { ...replacementOwner },
            replacementMembership: replacementMembership ? { ...replacementMembership } : null,
            requiresIdentityTransition: !identityReady,
            auditLog,
            replayed: false,
          };
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },

    async completeOwnerTransfer(input = {}) {
      const organizationId = String(input.organizationId || "");
      const newOwnerUserId = String(input.newOwnerUserId || "");
      const actorUserId = String(input.actorUserId || "");
      const identityOperationId = String(input.identityOperationId || "");
      const targetWorkspaceStatus = String(input.targetWorkspaceStatus || "");
      const idempotency = normalizeMutationIdempotency(input.idempotency);
      if (!organizationId || !newOwnerUserId || !actorUserId || !idempotency) {
        throw repositoryError(400, "WORKSPACE_OWNER_TRANSFER_INVALID", "Workspace owner transfer completion is incomplete");
      }
      if (targetWorkspaceStatus && targetWorkspaceStatus !== "active") {
        throw repositoryError(400, "WORKSPACE_STATUS_INVALID", "Owner identity finalization only supports active workspace status");
      }
      const auditAction = idempotency.operation === "workspace.owner.approval"
        ? "workspace.owner.approval"
        : "workspace.owner.transfer";
      const isOwnerApproval = idempotency.operation === "workspace.owner.approval";

      if (getPool()) {
        const result = await withSqlTransaction(async (client) => {
          const reservationRow = await findSqlMutationReplay(client, idempotency);
          if (!reservationRow) {
            throw repositoryError(409, "WORKSPACE_OWNER_TRANSFER_NOT_RESERVED", "Workspace owner transfer was not reserved");
          }
          const stored = objectOf(reservationRow.response_json);
          if (Number(reservationRow.response_status) === 200 && stored.state === "completed") {
            return { ...stored, replayed: true, auditLog: null, identityAuditLog: null };
          }
          await queryLockWorkspaceOwnerMutation(client);
          const selectedOrganization = await client.query(
            "SELECT * FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
            [organizationId],
          );
          if (!selectedOrganization.rows[0]) {
            throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
          }
          const currentOrganization = rowToOrganization(selectedOrganization.rows[0]);
          if (
            stored.previousOwnerUserId &&
            currentOrganization.ownerUserId !== stored.previousOwnerUserId &&
            currentOrganization.ownerUserId !== newOwnerUserId
          ) {
            throw repositoryError(409, "WORKSPACE_OWNER_TRANSFER_STALE", "Workspace ownership changed after this transfer was reserved");
          }
          const selectedOwner = await client.query(
            "SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
            [newOwnerUserId],
          );
          if (!selectedOwner.rows[0]) {
            throw repositoryError(404, "WORKSPACE_OWNER_NOT_FOUND", "The replacement workspace owner was not found");
          }
          let replacementOwner = rowToUser(selectedOwner.rows[0]);
          let completedIdentityOperation = null;
          let identityAuditLog = null;
          if (identityOperationId) {
            const selectedOperation = await client.query(
              "SELECT * FROM identity_operations WHERE id = $1 LIMIT 1 FOR UPDATE",
              [identityOperationId],
            );
            const identityOperation = rowToIdentityOperation(selectedOperation.rows[0]);
            if (
              !identityOperation ||
              identityOperation.targetUserId !== newOwnerUserId ||
              identityOperation.operation !== "change_role" ||
              identityOperation.status !== "provider_applied" ||
              identityOperation.targetState.role !== "workspace_owner" ||
              identityOperation.targetState.organizationId !== organizationId
            ) {
              throw repositoryError(
                409,
                "WORKSPACE_OWNER_IDENTITY_NOT_CONFIRMED",
                "The replacement owner's provider-backed identity transition is not ready",
              );
            }
            const roleTarget = identityOperation.targetState;
            const updatedOwner = await client.query(
              `
                UPDATE users
                SET role = 'workspace_owner',
                    requested_role = 'workspace_owner',
                    role_request_status = 'approved',
                    organization_id = $2,
                    account_status = 'active',
                    hospital = $3,
                    role_approved_at = COALESCE(role_approved_at, now()),
                    role_rejected_at = NULL,
                    role_reject_reason = NULL,
                    role_info_request_at = NULL,
                    role_info_request_message = NULL,
                    updated_at = now()
                WHERE id = $1
                RETURNING *
              `,
              [newOwnerUserId, organizationId, roleTarget.hospital || currentOrganization.name || "Shcare"],
            );
            replacementOwner = rowToUser(updatedOwner.rows[0]);
            const completedOperation = await client.query(
              `
                UPDATE identity_operations
                SET status = 'completed', completed_at = now(), updated_at = now(), error_code = NULL
                WHERE id = $1
                RETURNING *
              `,
              [identityOperationId],
            );
            completedIdentityOperation = rowToIdentityOperation(completedOperation.rows[0]);
            identityAuditLog = createAuditLog({
              actorUserId: identityOperation.actorUserId,
              organizationId,
              action: "identity.change_role.completed",
              resourceType: "user",
              resourceId: newOwnerUserId,
              metadata: { operationId: identityOperationId, providerStatus: identityOperation.providerStatus },
            });
            await queryInsertAuditLog(client, identityAuditLog);
          } else if (
            replacementOwner.role !== "workspace_owner" ||
            replacementOwner.requestedRole !== "workspace_owner" ||
            replacementOwner.roleRequestStatus !== "approved" ||
            replacementOwner.organizationId !== organizationId ||
            replacementOwner.accountStatus !== "active"
          ) {
            throw repositoryError(
              409,
              "WORKSPACE_OWNER_IDENTITY_NOT_CONFIRMED",
              "The replacement owner's canonical identity is not ready",
            );
          }

          const updatedMembership = await client.query(
            `
              INSERT INTO memberships (
                id, organization_id, user_id, role, status, suspended_at, created_at, updated_at
              )
              VALUES ($1, $2, $3, 'workspace_owner', 'active', NULL, now(), now())
              ON CONFLICT (organization_id, user_id)
              DO UPDATE SET
                role = 'workspace_owner',
                status = 'active',
                suspended_at = NULL,
                updated_at = now()
              RETURNING *
            `,
            [createId("mbr"), organizationId, newOwnerUserId],
          );
          const finalWorkspaceStatus = targetWorkspaceStatus || stored.targetWorkspaceStatus || "";
          const storedExpectedVersion = Number(stored.expectedVersion || input.expectedVersion);
          if (!isOwnerApproval && (!Number.isInteger(storedExpectedVersion) || storedExpectedVersion < 1)) {
            throw repositoryError(
              400,
              "WORKSPACE_VERSION_REQUIRED",
              "A positive integer workspace version is required for owner transfer",
            );
          }
          const updatedOrganization = isOwnerApproval
            ? await client.query(
                `
                  UPDATE organizations
                  SET owner_user_id = $2,
                      status = CASE WHEN $3 = '' THEN status ELSE $3 END,
                      updated_at = now()
                  WHERE id = $1
                  RETURNING *
                `,
                [organizationId, newOwnerUserId, finalWorkspaceStatus],
              )
            : await client.query(
                `
                  UPDATE organizations
                  SET owner_user_id = $2,
                      status = CASE WHEN $3 = '' THEN status ELSE $3 END,
                      version = version + 1,
                      updated_at = now()
                  WHERE id = $1 AND version = $4
                  RETURNING *
                `,
                [organizationId, newOwnerUserId, finalWorkspaceStatus, storedExpectedVersion],
              );
          if (!updatedOrganization.rows[0]) {
            throw repositoryError(
              409,
              "WORKSPACE_VERSION_CONFLICT",
              "Workspace was changed by another operation",
            );
          }
          const organization = rowToOrganization(updatedOrganization.rows[0]);
          const membership = rowToMembership(updatedMembership.rows[0]);
          const response = {
            state: "completed",
            operationId: stored.operationId || createId("op"),
            organization,
            membership,
            previousOwnerUserId: stored.previousOwnerUserId || "",
            newOwnerUserId,
            identityOperationId: completedIdentityOperation?.id || identityOperationId || "",
            targetWorkspaceStatus: finalWorkspaceStatus,
          };
          const auditLog = createAuditLog({
            actorUserId,
            organizationId,
            action: `${auditAction}.completed`,
            resourceType: "organization",
            resourceId: organizationId,
            ip: input.ip || "",
            userAgent: input.userAgent || "",
            metadata: {
              previousOwnerUserId: response.previousOwnerUserId,
              newOwnerUserId,
              identityOperationId: response.identityOperationId,
            },
          });
          await queryInsertAuditLog(client, auditLog);
          await client.query(
            `
              UPDATE mutation_idempotency
              SET response_status = 200, response_json = $4::jsonb, updated_at = now()
              WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
            `,
            [idempotency.scope, idempotency.operation, idempotency.key, JSON.stringify(response)],
          );
          return { ...response, replacementOwner, completedIdentityOperation, auditLog, identityAuditLog, replayed: false };
        });
        if (result.organization) syncArrayItem(getDb().organizations, result.organization);
        if (result.membership) syncArrayItem(getDb().memberships, result.membership);
        if (result.replacementOwner) syncArrayItem(getDb().users, result.replacementOwner);
        if (result.completedIdentityOperation) syncArrayItem(getDb().identityOperations, result.completedIdentityOperation);
        if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
        if (result.identityAuditLog) syncRuntimeAuditLog(result.identityAuditLog);
        await saveDb();
        return result;
      }

      return runWorkspaceOwnerMutationExclusive(organizationId, async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          const reservation = findRuntimeIdempotency(idempotency);
          assertIdempotencyFingerprint(reservation, idempotency);
          if (!reservation) {
            throw repositoryError(409, "WORKSPACE_OWNER_TRANSFER_NOT_RESERVED", "Workspace owner transfer was not reserved");
          }
          const stored = objectOf(reservation.responseResource);
          if (Number(reservation.responseStatus) === 200 && stored.state === "completed") {
            return { ...stored, replayed: true, auditLog: null, identityAuditLog: null };
          }
          const organization = (runtimeDb.organizations || []).find((item) => item.id === organizationId);
          const replacementOwner = (runtimeDb.users || []).find((item) => item.id === newOwnerUserId);
          if (!organization) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
          if (!replacementOwner) throw repositoryError(404, "WORKSPACE_OWNER_NOT_FOUND", "The replacement workspace owner was not found");
          if (
            stored.previousOwnerUserId &&
            organization.ownerUserId !== stored.previousOwnerUserId &&
            organization.ownerUserId !== newOwnerUserId
          ) {
            throw repositoryError(409, "WORKSPACE_OWNER_TRANSFER_STALE", "Workspace ownership changed after this transfer was reserved");
          }
          let completedIdentityOperation = null;
          let identityAuditLog = null;
          if (identityOperationId) {
            const identityOperation = (runtimeDb.identityOperations || []).find((item) => item.id === identityOperationId);
            if (
              !identityOperation ||
              identityOperation.targetUserId !== newOwnerUserId ||
              identityOperation.operation !== "change_role" ||
              identityOperation.status !== "provider_applied" ||
              identityOperation.targetState?.role !== "workspace_owner" ||
              identityOperation.targetState?.organizationId !== organizationId
            ) {
              throw repositoryError(
                409,
                "WORKSPACE_OWNER_IDENTITY_NOT_CONFIRMED",
                "The replacement owner's provider-backed identity transition is not ready",
              );
            }
            if (replacementOwner.role === "doctor") {
              for (const grant of runtimeDb.doctorPatientAccess || []) {
                if (grant.doctorUserId === newOwnerUserId && isPatientShareActive(grant)) {
                  grant.revokedAt = nowIso();
                  grant.revokedByUserId = actorUserId;
                  grant.updatedAt = nowIso();
                }
              }
            }
            replacementOwner.role = "workspace_owner";
            replacementOwner.requestedRole = "workspace_owner";
            replacementOwner.roleRequestStatus = "approved";
            replacementOwner.organizationId = organizationId;
            replacementOwner.accountStatus = "active";
            replacementOwner.hospital = identityOperation.targetState.hospital || organization.name || "Shcare";
            replacementOwner.roleApprovedAt = replacementOwner.roleApprovedAt || nowIso();
            replacementOwner.roleRejectedAt = "";
            replacementOwner.roleRejectReason = "";
            replacementOwner.roleInfoRequestAt = "";
            replacementOwner.roleInfoRequestMessage = "";
            replacementOwner.roleInfoRequiredFields = [];
            replacementOwner.updatedAt = nowIso();
            identityOperation.status = "completed";
            identityOperation.errorCode = "";
            identityOperation.completedAt = nowIso();
            identityOperation.updatedAt = nowIso();
            completedIdentityOperation = identityOperation;
            identityAuditLog = createAuditLog({
              actorUserId: identityOperation.actorUserId,
              organizationId,
              action: "identity.change_role.completed",
              resourceType: "user",
              resourceId: newOwnerUserId,
              metadata: { operationId: identityOperationId, providerStatus: identityOperation.providerStatus },
            });
            syncRuntimeAuditLog(identityAuditLog);
          } else if (
            replacementOwner.role !== "workspace_owner" ||
            replacementOwner.requestedRole !== "workspace_owner" ||
            replacementOwner.roleRequestStatus !== "approved" ||
            replacementOwner.organizationId !== organizationId ||
            replacementOwner.accountStatus !== "active"
          ) {
            throw repositoryError(
              409,
              "WORKSPACE_OWNER_IDENTITY_NOT_CONFIRMED",
              "The replacement owner's canonical identity is not ready",
            );
          }
          runtimeDb.memberships = Array.isArray(runtimeDb.memberships) ? runtimeDb.memberships : [];
          let membership = runtimeDb.memberships.find(
            (item) => item.organizationId === organizationId && item.userId === newOwnerUserId,
          );
          if (!membership) {
            membership = {
              id: createId("mbr"), organizationId, userId: newOwnerUserId,
              role: "workspace_owner", status: "active", suspendedAt: "",
              createdAt: nowIso(), updatedAt: nowIso(),
            };
            runtimeDb.memberships.push(membership);
          } else {
            membership.role = "workspace_owner";
            membership.status = "active";
            membership.suspendedAt = "";
            membership.updatedAt = nowIso();
          }
          organization.ownerUserId = newOwnerUserId;
          const finalWorkspaceStatus = targetWorkspaceStatus || stored.targetWorkspaceStatus || "";
          if (finalWorkspaceStatus) organization.status = finalWorkspaceStatus;
          const storedExpectedVersion = Number(stored.expectedVersion || input.expectedVersion);
          if (!isOwnerApproval) {
            if (!Number.isInteger(storedExpectedVersion) || storedExpectedVersion < 1) {
              throw repositoryError(
                400,
                "WORKSPACE_VERSION_REQUIRED",
                "A positive integer workspace version is required for owner transfer",
              );
            }
            if (Number(organization.version || 1) !== storedExpectedVersion) {
              throw repositoryError(
                409,
                "WORKSPACE_VERSION_CONFLICT",
                "Workspace was changed by another operation",
                { expectedVersion: storedExpectedVersion, currentVersion: Number(organization.version || 1) },
              );
            }
            organization.version = storedExpectedVersion + 1;
          }
          organization.updatedAt = nowIso();
          const response = {
            state: "completed",
            operationId: stored.operationId || createId("op"),
            organization: { ...organization },
            membership: { ...membership },
            previousOwnerUserId: stored.previousOwnerUserId || "",
            newOwnerUserId,
            identityOperationId: completedIdentityOperation?.id || identityOperationId || "",
            targetWorkspaceStatus: finalWorkspaceStatus,
          };
          const auditLog = createAuditLog({
            actorUserId,
            organizationId,
            action: `${auditAction}.completed`,
            resourceType: "organization",
            resourceId: organizationId,
            ip: input.ip || "",
            userAgent: input.userAgent || "",
            metadata: {
              previousOwnerUserId: response.previousOwnerUserId,
              newOwnerUserId,
              identityOperationId: response.identityOperationId,
            },
          });
          syncRuntimeAuditLog(auditLog);
          syncRuntimeMutationIdempotency(idempotency, "organization", organizationId, 200, response);
          await saveDb();
          return { ...response, replacementOwner: { ...replacementOwner }, auditLog, identityAuditLog, replayed: false };
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },
  };

  const memberships = {
    async listForUser(userId) {
      const id = String(userId || "");
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at ASC",
            [id],
          );
          const canonical = result.rows.map(rowToMembership);
          getDb().memberships = getDb().memberships.filter((item) => item.userId !== id);
          for (const membership of canonical) syncArrayItem(getDb().memberships, membership);
          return canonical;
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "MEMBERSHIP_STORAGE_UNAVAILABLE", "Membership storage is unavailable");
        }
      }
      return getDb().memberships.filter((item) => item.userId === id);
    },

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
          status: "active",
          suspendedAt: "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        getDb().memberships.push(membership);
      }
      // Existing membership roles are capability grants. Updating a user
      // profile must never rewrite them; guarded identity transitions do that
      // atomically after provider confirmation.
      await upsertMembershipSql(membership);
      await saveDb();
      return membership;
    },

    async changeLifecycle(input = {}) {
      const organizationId = String(input.organizationId || "");
      const targetUserId = String(input.targetUserId || "");
      const action = String(input.action || "").toLowerCase();
      if (!organizationId || !targetUserId || !["suspend", "reactivate", "revoke"].includes(action)) {
        throw repositoryError(
          400,
          "MEMBERSHIP_LIFECYCLE_INVALID",
          "A valid workspace, staff member, and lifecycle action are required",
        );
      }
      const idempotency = normalizeMutationIdempotency(input.idempotency);
      const responseStatus = 200;

      const assertOwnerRemovalAllowed = ({
        membership,
        organization,
        memberships,
        users,
      }) => {
        if (action === "reactivate") return;
        const ownerRoles = new Set(["owner", "workspace_owner"]);
        const targetIsOwner =
          ownerRoles.has(String(membership.role || "")) ||
          String(organization?.ownerUserId || "") === targetUserId;
        if (!targetIsOwner) return;
        const otherActiveOwners = memberships.filter((candidate) => {
          if (
            candidate.organizationId !== organizationId ||
            candidate.userId === targetUserId ||
            !ownerRoles.has(String(candidate.role || "")) ||
            String(candidate.status || "active") !== "active"
          ) {
            return false;
          }
          const owner = users.find((user) => user.id === candidate.userId);
          return owner && String(owner.accountStatus || "active") === "active";
        });
        if (otherActiveOwners.length === 0) {
          throw repositoryError(
            409,
            "LAST_WORKSPACE_OWNER",
            "The last active workspace owner cannot be suspended or revoked",
          );
        }
        if (String(organization?.ownerUserId || "") === targetUserId) {
          throw repositoryError(
            409,
            "WORKSPACE_OWNER_TRANSFER_REQUIRED",
            "Transfer workspace ownership before suspending or revoking the current owner",
          );
        }
      };

      if (!getPool()) {
        const runtimeDb = getDb();
        const replay = idempotency ? findRuntimeIdempotency(idempotency) : null;
        if (replay) {
          assertIdempotencyFingerprint(replay, idempotency);
          replay.lastSeenAt = nowIso();
          return {
            membership: cloneRuntimeValue(replay.responseResource?.membership),
            replayed: true,
            responseStatus: Number(replay.responseStatus || responseStatus),
          };
        }

        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          const membership = runtimeDb.memberships.find(
            (item) => item.organizationId === organizationId && item.userId === targetUserId,
          );
          if (!membership) {
            throw repositoryError(
              404,
              "WORKSPACE_MEMBERSHIP_NOT_FOUND",
              "The staff member does not belong to the selected workspace",
            );
          }
          const organization = runtimeDb.organizations.find((item) => item.id === organizationId) || null;
          assertOwnerRemovalAllowed({
            membership,
            organization,
            memberships: runtimeDb.memberships,
            users: runtimeDb.users,
          });

          const changedAt = nowIso();
          let nextMembership;
          if (action === "revoke") {
            nextMembership = {
              ...membership,
              status: "revoked",
              suspendedAt: membership.suspendedAt || "",
              updatedAt: changedAt,
            };
            runtimeDb.memberships = runtimeDb.memberships.filter((item) => item.id !== membership.id);
          } else {
            membership.status = action === "suspend" ? "suspended" : "active";
            membership.suspendedAt = action === "suspend" ? (membership.suspendedAt || changedAt) : "";
            membership.updatedAt = changedAt;
            nextMembership = { ...membership };
          }

          const auditLog = createAuditLog({
            ...(input.audit || {}),
            organizationId,
            action: input.audit?.action || `workspace.membership.${action}`,
            resourceType: "membership",
            resourceId: membership.id,
            metadata: {
              ...(input.audit?.metadata || {}),
              action,
              targetUserId,
              membershipRole: membership.role || "",
            },
          });
          const responseResource = {
            action,
            revoked: action === "revoke",
            membership: nextMembership,
          };
          syncRuntimeAuditLog(auditLog);
          syncRuntimeMutationIdempotency(
            idempotency,
            "membership",
            membership.id,
            responseStatus,
            responseResource,
          );
          await saveDb();
          return {
            membership: nextMembership,
            auditLog,
            replayed: false,
            responseStatus,
          };
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      }

      const result = await withSqlTransaction(async (client) => {
        const replay = await findSqlMutationReplay(client, idempotency);
        if (replay) {
          const response = objectOf(replay.response_json);
          return {
            membership: response.membership || null,
            auditLog: null,
            replayed: true,
            responseStatus: Number(replay.response_status || responseStatus),
          };
        }

        const selected = await client.query(
          `
            SELECT membership.*, organization.owner_user_id
            FROM memberships membership
            JOIN organizations organization ON organization.id = membership.organization_id
            WHERE membership.organization_id = $1 AND membership.user_id = $2
            LIMIT 1
            FOR UPDATE OF membership, organization
          `,
          [organizationId, targetUserId],
        );
        const row = selected.rows[0] || null;
        if (!row) {
          throw repositoryError(
            404,
            "WORKSPACE_MEMBERSHIP_NOT_FOUND",
            "The staff member does not belong to the selected workspace",
          );
        }
        const membership = rowToMembership(row);
        if (action !== "reactivate") {
          const ownerRoles = new Set(["owner", "workspace_owner"]);
          const targetIsOwner =
            ownerRoles.has(String(membership.role || "")) ||
            String(row.owner_user_id || "") === targetUserId;
          if (targetIsOwner) {
            const otherOwners = await client.query(
              `
                SELECT other_membership.user_id
                FROM memberships other_membership
                JOIN users other_owner ON other_owner.id = other_membership.user_id
                WHERE other_membership.organization_id = $1
                  AND other_membership.user_id <> $2
                  AND other_membership.role IN ('owner', 'workspace_owner')
                  AND other_membership.status = 'active'
                  AND LOWER(COALESCE(other_owner.account_status, 'active')) = 'active'
                LIMIT 1
                FOR UPDATE OF other_membership, other_owner
              `,
              [organizationId, targetUserId],
            );
            if (!otherOwners.rows[0]) {
              throw repositoryError(
                409,
                "LAST_WORKSPACE_OWNER",
                "The last active workspace owner cannot be suspended or revoked",
              );
            }
            if (String(row.owner_user_id || "") === targetUserId) {
              throw repositoryError(
                409,
                "WORKSPACE_OWNER_TRANSFER_REQUIRED",
                "Transfer workspace ownership before suspending or revoking the current owner",
              );
            }
          }
        }

        const changedAt = nowIso();
        let nextMembership;
        if (action === "revoke") {
          await client.query(
            "DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2",
            [organizationId, targetUserId],
          );
          nextMembership = {
            ...membership,
            status: "revoked",
            updatedAt: changedAt,
          };
        } else {
          const status = action === "suspend" ? "suspended" : "active";
          const updated = await client.query(
            `
              UPDATE memberships
              SET
                status = $3,
                suspended_at = CASE WHEN $3 = 'suspended' THEN COALESCE(suspended_at, $4) ELSE NULL END,
                updated_at = $4
              WHERE organization_id = $1 AND user_id = $2
              RETURNING *
            `,
            [organizationId, targetUserId, status, changedAt],
          );
          nextMembership = rowToMembership(updated.rows[0]);
        }

        const auditLog = createAuditLog({
          ...(input.audit || {}),
          organizationId,
          action: input.audit?.action || `workspace.membership.${action}`,
          resourceType: "membership",
          resourceId: membership.id,
          metadata: {
            ...(input.audit?.metadata || {}),
            action,
            targetUserId,
            membershipRole: membership.role || "",
          },
        });
        const responseResource = {
          action,
          revoked: action === "revoke",
          membership: nextMembership,
        };
        await queryInsertAuditLog(client, auditLog);
        await insertSqlMutationIdempotency(
          client,
          idempotency,
          "membership",
          membership.id,
          responseStatus,
          responseResource,
        );
        return {
          membership: nextMembership,
          auditLog,
          replayed: false,
          responseStatus,
        };
      });

      if (!result.replayed) {
        if (action === "revoke") {
          getDb().memberships = getDb().memberships.filter(
            (item) => !(item.organizationId === organizationId && item.userId === targetUserId),
          );
        } else if (result.membership) {
          syncArrayItem(getDb().memberships, result.membership);
        }
        if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
        syncRuntimeMutationIdempotency(
          idempotency,
          "membership",
          result.membership?.id || "",
          result.responseStatus,
          {
            action,
            revoked: action === "revoke",
            membership: result.membership,
          },
        );
        await saveDb();
      }
      return result;
    },
  };

  function exportRecordTimestamp(record, fallbackField = "") {
    return String(record?.createdAt || (fallbackField ? record?.[fallbackField] : "") || "");
  }

  function isWithinExportDateRange(timestamp, startDate, endDate) {
    if (!startDate && !endDate) return true;
    const value = Date.parse(timestamp || "");
    if (!Number.isFinite(value)) return false;
    const start = startDate ? Date.parse(`${startDate}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY;
    const endExclusive = endDate
      ? Date.parse(`${endDate}T00:00:00.000Z`) + 24 * 60 * 60 * 1000
      : Number.POSITIVE_INFINITY;
    return value >= start && value < endExclusive;
  }

  function sortExportRecords(records, fallbackField = "") {
    return [...records].sort((left, right) => {
      const leftTimestamp = exportRecordTimestamp(left, fallbackField);
      const rightTimestamp = exportRecordTimestamp(right, fallbackField);
      return leftTimestamp.localeCompare(rightTimestamp) || String(left.id || "").localeCompare(String(right.id || ""));
    });
  }

  function assembleExportSnapshot(input, collections) {
    const patients = sortExportRecords(collections.patients || []).map(exportPatientRecord);
    const devices = sortExportRecords(collections.devices || []).map(exportDeviceRecord);
    const scans = sortExportRecords(collections.scans || [], "startedAt").map(exportScanRecord);
    const appointments = input.includeHistory
      ? sortExportRecords(collections.appointments || [], "startsAt").map(exportAppointmentRecord)
      : [];
    const reports = input.includeReports
      ? sortExportRecords(collections.reports || []).map(exportAiResultRecord)
      : [];
    const audioFiles = input.includeAudio
      ? sortExportRecords(collections.audioFiles || []).map(exportAudioMetadataRecord)
      : [];
    const counts = {
      patients: patients.length,
      devices: devices.length,
      scans: scans.length,
      appointments: appointments.length,
      reports: reports.length,
      audioFiles: audioFiles.length,
    };
    counts.total = Object.values(counts).reduce((total, value) => total + value, 0);
    return {
      schemaVersion: "shcare.export.v1",
      exportId: input.exportId,
      dataset: "clinical_bundle",
      generatedAt: input.generatedAt,
      scope: {
        organizationId: input.organizationId,
        workspaceId: input.organizationId,
        kind: input.scopeKind || "workspace",
        actorUserId: input.actorUserId || "",
        patientIds: input.restrictToPatientIds ? [...input.patientIds] : [],
      },
      filters: {
        startDate: input.startDate || "",
        endDate: input.endDate || "",
        includeAudio: Boolean(input.includeAudio),
        includeReports: Boolean(input.includeReports),
        includeHistory: Boolean(input.includeHistory),
      },
      counts,
      data: {
        patients,
        devices,
        scans,
        appointments,
        reports,
        audioFiles,
      },
    };
  }

  const exports = {
    async list() {
      if (getPool()) {
        const sqlExports = await withSql(async (pool) => {
          const result = await pool.query("SELECT * FROM exports ORDER BY created_at DESC LIMIT 500");
          return result.rows.map(rowToExport);
        });
        getDb().exports = sqlExports;
        return sqlExports;
      }
      const db = getDb();
      db.exports = Array.isArray(db.exports) ? db.exports : [];
      return db.exports;
    },

    async listPage(input = {}) {
      const page = Math.max(1, Number.parseInt(input.page, 10) || 1);
      const limit = Math.max(1, Math.min(100, Number.parseInt(input.limit, 10) || 25));
      const organizationId = String(input.organizationId || "");
      const createdByUserId = String(input.createdByUserId || "");
      const format = normalizeExportFormat(input.format || "") || "";
      const dataset = String(input.dataset || "");
      const status = String(input.status || "");
      const sort = ["createdAt:asc", "createdAt:desc"].includes(String(input.sort || ""))
        ? String(input.sort)
        : "createdAt:desc";
      if (getPool()) {
        const result = await withSql(async (pool) => {
          const clauses = [];
          const parameters = [];
          const bind = (value) => {
            parameters.push(value);
            return `$${parameters.length}`;
          };
          if (organizationId) clauses.push(`organization_id = ${bind(organizationId)}`);
          if (createdByUserId) clauses.push(`created_by_user_id = ${bind(createdByUserId)}`);
          if (format) clauses.push(`format = ${bind(format)}`);
          if (dataset) clauses.push(`dataset = ${bind(dataset)}`);
          if (status) clauses.push(`status = ${bind(status)}`);
          const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
          const order = sort === "createdAt:asc" ? "created_at ASC, id ASC" : "created_at DESC, id DESC";
          const count = await pool.query(`SELECT COUNT(*)::bigint AS total FROM exports ${where}`, parameters);
          const rows = await pool.query(
            `SELECT * FROM exports ${where} ORDER BY ${order} LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
            [...parameters, limit, (page - 1) * limit],
          );
          return {
            items: rows.rows.map(rowToExport),
            total: Number(count.rows[0]?.total || 0),
            page,
            limit,
            sort,
          };
        });
        result.items.forEach((item) => syncArrayItem(getDb().exports, item));
        return result;
      }
      const items = (getDb().exports || [])
        .filter((item) => !organizationId || item.organizationId === organizationId)
        .filter((item) => !createdByUserId || item.createdByUserId === createdByUserId)
        .filter((item) => !format || item.format === format)
        .filter((item) => !dataset || (item.dataset || "clinical_bundle") === dataset)
        .filter((item) => !status || item.status === status)
        .sort((left, right) => {
          const compared = String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
          return (sort === "createdAt:asc" ? compared : -compared) || String(left.id || "").localeCompare(String(right.id || ""));
        });
      return {
        items: items.slice((page - 1) * limit, page * limit),
        total: items.length,
        page,
        limit,
        sort,
      };
    },

    async findById(id) {
      const exportId = String(id || "");
      if (getPool()) {
        const exportJob = await withSql(async (pool) => {
          const result = await pool.query("SELECT * FROM exports WHERE id = $1 LIMIT 1", [exportId]);
          return result.rows[0] ? rowToExport(result.rows[0]) : null;
        });
        if (!exportJob) {
          getDb().exports = (getDb().exports || []).filter((item) => item.id !== exportId);
          return null;
        }
        return syncArrayItem(getDb().exports, exportJob);
      }
      return (getDb().exports || []).find((item) => item.id === exportId) || null;
    },

    async buildSnapshot(input = {}) {
      const normalized = {
        exportId: String(input.exportId || ""),
        organizationId: String(input.organizationId || ""),
        generatedAt: String(input.generatedAt || nowIso()),
        startDate: String(input.startDate || ""),
        endDate: String(input.endDate || ""),
        scopeKind: String(input.scopeKind || "workspace"),
        actorUserId: String(input.actorUserId || ""),
        restrictToPatientIds: Boolean(input.restrictToPatientIds),
        patientIds: [...new Set((Array.isArray(input.patientIds) ? input.patientIds : []).map(String).filter(Boolean))].sort(),
        dataset: String(input.dataset || "clinical_bundle"),
        auditFilters:
          input.auditFilters && typeof input.auditFilters === "object" && !Array.isArray(input.auditFilters)
            ? { ...input.auditFilters }
            : {},
        includeAudio: Boolean(input.includeAudio),
        includeReports: Boolean(input.includeReports),
        includeHistory: Boolean(input.includeHistory),
      };
      const allowsPlatformAuditScope =
        normalized.dataset === "audit_logs" && normalized.scopeKind === "platform";
      if (!normalized.exportId || (!normalized.organizationId && !allowsPlatformAuditScope)) {
        throw repositoryError(
          400,
          "EXPORT_SCOPE_REQUIRED",
          "An export id and workspace scope are required",
        );
      }

      if (normalized.dataset === "audit_logs") {
        const exportedLogs = await auditLogs.listForExport({
          ...normalized.auditFilters,
          organizationId: normalized.organizationId,
        });
        return assembleAuditExportSnapshot(normalized, exportedLogs, getDb());
      }

      if (getPool()) {
        return withSql(async (pool) => {
          const parameters = [
            normalized.organizationId,
            normalized.startDate || null,
            normalized.endDate || null,
            normalized.restrictToPatientIds,
            normalized.patientIds,
          ];
          const [patientResult, deviceResult, scanResult, appointmentResult, audioResult, reportResult] =
            await Promise.all([
              pool.query(
                `
                  SELECT *
                  FROM patients
                  WHERE organization_id = $1
                    AND deleted_at IS NULL
                    AND ($4::boolean = false OR id = ANY($5::text[]))
                    AND ($2::date IS NULL OR created_at >= $2::date)
                    AND ($3::date IS NULL OR created_at < ($3::date + INTERVAL '1 day'))
                  ORDER BY created_at ASC, id ASC
                `,
                parameters,
              ),
              pool.query(
                `
                  SELECT *
                  FROM devices
                  WHERE organization_id = $1
                    AND ($4::boolean = false OR assigned_patient_id = ANY($5::text[]))
                    AND ($2::date IS NULL OR created_at >= $2::date)
                    AND ($3::date IS NULL OR created_at < ($3::date + INTERVAL '1 day'))
                  ORDER BY created_at ASC, id ASC
                `,
                parameters,
              ),
              pool.query(
                `
                  SELECT *
                  FROM scan_sessions
                  WHERE organization_id = $1
                    AND ($4::boolean = false OR patient_id = ANY($5::text[]))
                    AND ($2::date IS NULL OR created_at >= $2::date)
                    AND ($3::date IS NULL OR created_at < ($3::date + INTERVAL '1 day'))
                  ORDER BY created_at ASC, id ASC
                `,
                parameters,
              ),
              normalized.includeHistory
                ? pool.query(
                    `
                      SELECT *
                      FROM appointments
                      WHERE organization_id = $1
                        AND ($4::boolean = false OR patient_id = ANY($5::text[]))
                        AND ($2::date IS NULL OR created_at >= $2::date)
                        AND ($3::date IS NULL OR created_at < ($3::date + INTERVAL '1 day'))
                      ORDER BY created_at ASC, id ASC
                    `,
                    parameters,
                  )
                : Promise.resolve({ rows: [] }),
              normalized.includeAudio
                ? pool.query(
                    `
                      SELECT audio.*
                      FROM audio_files audio
                      JOIN scan_sessions scan ON scan.id = audio.scan_id
                      WHERE scan.organization_id = $1
                        AND ($4::boolean = false OR scan.patient_id = ANY($5::text[]))
                        AND ($2::date IS NULL OR audio.created_at >= $2::date)
                        AND ($3::date IS NULL OR audio.created_at < ($3::date + INTERVAL '1 day'))
                      ORDER BY audio.created_at ASC, audio.id ASC
                    `,
                    parameters,
                  )
                : Promise.resolve({ rows: [] }),
              normalized.includeReports
                ? pool.query(
                    `
                      SELECT report.*
                      FROM ai_results report
                      JOIN scan_sessions scan ON scan.id = report.scan_id
                      WHERE scan.organization_id = $1
                        AND ($4::boolean = false OR scan.patient_id = ANY($5::text[]))
                        AND ($2::date IS NULL OR report.created_at >= $2::date)
                        AND ($3::date IS NULL OR report.created_at < ($3::date + INTERVAL '1 day'))
                      ORDER BY report.created_at ASC, report.id ASC
                    `,
                    parameters,
                  )
                : Promise.resolve({ rows: [] }),
            ]);
          return assembleExportSnapshot(normalized, {
            patients: patientResult.rows.map(rowToPatient),
            devices: deviceResult.rows.map(rowToDevice),
            scans: scanResult.rows.map(rowToScan),
            appointments: appointmentResult.rows.map(rowToAppointment),
            audioFiles: audioResult.rows.map(rowToAudioFile),
            reports: reportResult.rows.map(rowToAiResult),
          });
        });
      }

      const db = getDb();
      const allowedPatientIds = new Set(normalized.patientIds);
      const patientAllowed = (patientId) =>
        !normalized.restrictToPatientIds || allowedPatientIds.has(String(patientId || ""));
      const scans = (db.scans || []).filter(
        (scan) =>
          scan.organizationId === normalized.organizationId &&
          patientAllowed(scan.patientId) &&
          isWithinExportDateRange(
            exportRecordTimestamp(scan, "startedAt"),
            normalized.startDate,
            normalized.endDate,
          ),
      );
      const workspaceScanIds = new Set(scans.map((scan) => scan.id));
      return assembleExportSnapshot(normalized, {
        patients: (db.patients || []).filter(
          (patient) =>
            !patient.deletedAt &&
            patient.organizationId === normalized.organizationId &&
            patientAllowed(patient.id) &&
            isWithinExportDateRange(patient.createdAt, normalized.startDate, normalized.endDate),
        ),
        devices: (db.devices || []).filter(
          (device) =>
            device.organizationId === normalized.organizationId &&
            patientAllowed(device.assignedPatientId) &&
            isWithinExportDateRange(device.createdAt, normalized.startDate, normalized.endDate),
        ),
        scans,
        appointments: normalized.includeHistory
          ? (db.appointments || []).filter(
              (appointment) =>
                appointment.organizationId === normalized.organizationId &&
                patientAllowed(appointment.patientId) &&
                isWithinExportDateRange(
                  exportRecordTimestamp(appointment, "startsAt"),
                  normalized.startDate,
                  normalized.endDate,
                ),
            )
          : [],
        audioFiles: normalized.includeAudio
          ? (db.audioFiles || []).filter(
              (audioFile) =>
                workspaceScanIds.has(audioFile.scanId) &&
                isWithinExportDateRange(audioFile.createdAt, normalized.startDate, normalized.endDate),
            )
          : [],
        reports: normalized.includeReports
          ? (db.aiResults || []).filter(
              (result) =>
                workspaceScanIds.has(result.scanId) &&
                isWithinExportDateRange(result.createdAt, normalized.startDate, normalized.endDate),
            )
          : [],
      });
    },

    async createWithAudit(input, auditInput = {}, idempotencyInput = null, responseStatus = 201) {
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      if (!idempotency) {
        throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
      }
      const format = normalizeExportFormat(input?.format);
      if (!format) {
        throw repositoryError(
          422,
          "EXPORT_FORMAT_UNSUPPORTED",
          "The requested export format is unsupported",
        );
      }
      const dataset = String(input?.dataset || "clinical_bundle");
      if (!["clinical_bundle", "audit_logs"].includes(dataset)) {
        throw repositoryError(
          422,
          "EXPORT_DATASET_UNSUPPORTED",
          "The requested export dataset is unsupported",
        );
      }
      const scopeKind = String(input?.scopeKind || input?.snapshot?.scope?.kind || "workspace");
      if (!EXPORT_SCOPE_KINDS.includes(scopeKind)) {
        throw repositoryError(
          422,
          "EXPORT_SCOPE_KIND_UNSUPPORTED",
          "The requested export scope kind is unsupported",
        );
      }
      const exportJob = {
        id: String(input?.id || ""),
        organizationId: String(input?.organizationId || ""),
        createdByUserId: String(input?.createdByUserId || ""),
        format,
        dataset,
        scopeKind,
        filters: cloneRuntimeValue(input?.filters || input?.snapshot?.filters || {}),
        rendererVersion: String(input?.rendererVersion || EXPORT_ARTIFACT_RENDERER_VERSION),
        status: "ready",
        includeAudio: Boolean(input?.includeAudio),
        includeReports: Boolean(input?.includeReports),
        includeHistory: Boolean(input?.includeHistory),
        startDate: String(input?.startDate || ""),
        endDate: String(input?.endDate || ""),
        snapshot: cloneRuntimeValue(input?.snapshot || {}),
        downloadUrl: String(input?.downloadUrl || ""),
        createdAt: String(input?.createdAt || nowIso()),
        updatedAt: String(input?.updatedAt || nowIso()),
        downloadedAt: "",
      };
      if (
        !exportJob.id ||
        (!exportJob.organizationId &&
          !(exportJob.dataset === "audit_logs" && exportJob.scopeKind === "platform")) ||
        exportJob.snapshot?.exportId !== exportJob.id ||
        exportJob.snapshot?.scope?.organizationId !== exportJob.organizationId ||
        String(exportJob.snapshot?.dataset || "clinical_bundle") !== exportJob.dataset ||
        String(exportJob.snapshot?.scope?.kind || "workspace") !== exportJob.scopeKind
      ) {
        throw repositoryError(
          400,
          "EXPORT_SNAPSHOT_INVALID",
          "The persisted export snapshot does not match its immutable scope",
        );
      }
      exportJob.recordCount = Number(exportJob.snapshot?.counts?.total || 0);
      const artifact = await buildExportArtifact(
        exportJob.snapshot,
        exportJob.format,
        exportJob.rendererVersion,
      );
      exportJob.artifactByteSize = artifact.buffer.length;
      exportJob.artifactSha256 = crypto.createHash("sha256").update(artifact.buffer).digest("hex");
      exportJob.downloadUrl =
        exportJob.downloadUrl || `/api/v1/exports/download/${encodeURIComponent(exportJob.id)}`;
      const auditLog = createAuditLog({
        ...auditInput,
        organizationId: exportJob.organizationId,
        resourceType: "export",
        resourceId: exportJob.id,
        metadata: {
          ...(auditInput.metadata || {}),
          format: exportJob.format,
          dataset: exportJob.dataset,
          scopeKind: exportJob.scopeKind,
          rendererVersion: exportJob.rendererVersion,
          recordCount: exportJob.recordCount,
          artifactByteSize: exportJob.artifactByteSize,
        },
      });

      if (!getPool()) {
        return runExportMutationExclusive(idempotency, async () => {
          const existing = findRuntimeIdempotency(idempotency);
          if (existing) {
            assertIdempotencyFingerprint(existing, idempotency);
            existing.lastSeenAt = nowIso();
            const replayedJob =
              (getDb().exports || []).find((item) => item.id === existing.resourceId) || null;
            if (!replayedJob) {
              throw repositoryError(
                409,
                "IDEMPOTENT_EXPORT_MISSING",
                "The original export result is no longer available",
              );
            }
            await saveDb();
            return {
              exportJob: replayedJob,
              auditLog: null,
              replayed: true,
              responseStatus: Number(existing.responseStatus || responseStatus),
            };
          }
          const db = getDb();
          const before = snapshotRuntimeDb(db);
          try {
            db.exports = Array.isArray(db.exports) ? db.exports : [];
            syncArrayItem(db.exports, exportJob);
            syncRuntimeAuditLog(auditLog);
            syncRuntimeMutationIdempotency(
              idempotency,
              "export",
              exportJob.id,
              responseStatus,
              { id: exportJob.id },
            );
            await saveDb();
          } catch (error) {
            restoreRuntimeDb(db, before);
            throw error;
          }
          return { exportJob, auditLog, replayed: false, responseStatus };
        });
      }

      const result = await withSqlTransaction(async (client) => {
        const replay = await findSqlMutationReplay(client, idempotency);
        if (replay) {
          const selected = await client.query("SELECT * FROM exports WHERE id = $1 LIMIT 1", [
            replay.resource_id,
          ]);
          if (!selected.rows[0]) {
            throw repositoryError(
              409,
              "IDEMPOTENT_EXPORT_MISSING",
              "The original export result is no longer available",
            );
          }
          return {
            exportJob: rowToExport(selected.rows[0]),
            auditLog: null,
            replayed: true,
            responseStatus: Number(replay.response_status || responseStatus),
          };
        }
        const inserted = await client.query(
          `
            INSERT INTO exports (
              id, organization_id, created_by_user_id, format, dataset, scope_kind, filters_json, renderer_version, status,
              include_audio, include_reports, include_history, start_date, end_date,
              record_count, download_url, snapshot_json, artifact_byte_size, artifact_sha256,
              created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'ready',
              $9, $10, $11, $12, $13,
              $14, $15, $16::jsonb, $17, $18,
              $19, $20
            )
            RETURNING *
          `,
          [
            exportJob.id,
            optional(exportJob.organizationId),
            optional(exportJob.createdByUserId),
            exportJob.format,
            exportJob.dataset,
            exportJob.scopeKind,
            JSON.stringify(exportJob.filters),
            exportJob.rendererVersion,
            exportJob.includeAudio,
            exportJob.includeReports,
            exportJob.includeHistory,
            optional(exportJob.startDate),
            optional(exportJob.endDate),
            exportJob.recordCount,
            exportJob.downloadUrl,
            JSON.stringify(exportJob.snapshot),
            exportJob.artifactByteSize,
            exportJob.artifactSha256,
            exportJob.createdAt,
            exportJob.updatedAt,
          ],
        );
        const persisted = rowToExport(inserted.rows[0]);
        await queryInsertAuditLog(client, auditLog);
        await insertSqlMutationIdempotency(
          client,
          idempotency,
          "export",
          persisted.id,
          responseStatus,
          { id: persisted.id },
        );
        return { exportJob: persisted, auditLog, replayed: false, responseStatus };
      });
      syncArrayItem(getDb().exports, result.exportJob);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(
        idempotency,
        "export",
        result.exportJob.id,
        result.responseStatus,
        { id: result.exportJob.id },
      );
      await saveDb();
      return result;
    },

    async markDownloadedWithAudit(id, auditInput = {}) {
      const exportId = String(id || "");
      if (!getPool()) {
        const db = getDb();
        const exportJob = (db.exports || []).find((item) => item.id === exportId) || null;
        if (!exportJob) return null;
        const before = snapshotRuntimeDb(db);
        const downloadedAt = nowIso();
        const auditLog = createAuditLog({
          ...auditInput,
          organizationId: exportJob.organizationId || auditInput.organizationId || "",
          resourceType: "export",
          resourceId: exportJob.id,
          metadata: {
            ...(auditInput.metadata || {}),
            artifactByteSize: Number(exportJob.artifactByteSize || 0),
          },
        });
        try {
          exportJob.downloadedAt = downloadedAt;
          exportJob.updatedAt = downloadedAt;
          syncRuntimeAuditLog(auditLog);
          await saveDb();
        } catch (error) {
          restoreRuntimeDb(db, before);
          throw error;
        }
        return { exportJob, auditLog };
      }

      const result = await withSqlTransaction(async (client) => {
        const selected = await client.query("SELECT * FROM exports WHERE id = $1 LIMIT 1 FOR UPDATE", [
          exportId,
        ]);
        if (!selected.rows[0]) return null;
        const current = rowToExport(selected.rows[0]);
        const downloadedAt = nowIso();
        const auditLog = createAuditLog({
          ...auditInput,
          organizationId: current.organizationId || auditInput.organizationId || "",
          resourceType: "export",
          resourceId: current.id,
          metadata: {
            ...(auditInput.metadata || {}),
            artifactByteSize: Number(current.artifactByteSize || 0),
          },
        });
        const updated = await client.query(
          "UPDATE exports SET downloaded_at = $2, updated_at = $2 WHERE id = $1 RETURNING *",
          [exportId, downloadedAt],
        );
        await queryInsertAuditLog(client, auditLog);
        return { exportJob: rowToExport(updated.rows[0]), auditLog };
      });
      if (!result) return null;
      syncArrayItem(getDb().exports, result.exportJob);
      syncRuntimeAuditLog(result.auditLog);
      await saveDb();
      return result;
    },
  };

  function assertRuntimeNotificationAudience(notification) {
    if (!notification.organizationId) return;
    const runtimeDb = getDb();
    const workspace = (runtimeDb.organizations || []).find(
      (organization) => organization.id === notification.organizationId,
    );
    if (!workspace) {
      throw repositoryError(404, "NOTIFICATION_WORKSPACE_NOT_FOUND", "Notification workspace was not found");
    }
    if (!notification.userId) return;
    const targetUser = (runtimeDb.users || []).find((user) => user.id === notification.userId);
    const membership = (runtimeDb.memberships || []).find(
      (item) => item.userId === notification.userId && item.organizationId === notification.organizationId,
    );
    const activeMembership = Boolean(
      membership && String(membership.status || "active").toLowerCase() === "active",
    );
    const ownsWorkspace = Boolean(
      workspace.ownerUserId === notification.userId &&
      activeMembership &&
      WORKSPACE_OWNER_MEMBERSHIP_ROLES.has(String(membership.role || "").toLowerCase()),
    );
    const platformAdmin = ["admin", "platform_admin"].includes(String(targetUser?.role || ""));
    if (
      !targetUser ||
      String(targetUser.accountStatus || "active") !== "active" ||
      (!activeMembership && !ownsWorkspace && !platformAdmin)
    ) {
      throw repositoryError(
        409,
        "NOTIFICATION_AUDIENCE_TENANT_MISMATCH",
        "Notification user is not an active member of its workspace",
      );
    }
  }

  async function assertSqlNotificationAudience(client, notification) {
    if (!notification.organizationId) return;
    const selectedWorkspace = await client.query(
      "SELECT id, status, owner_user_id FROM organizations WHERE id = $1 LIMIT 1 FOR SHARE",
      [notification.organizationId],
    );
    const workspace = selectedWorkspace.rows[0] || null;
    if (!workspace) {
      throw repositoryError(404, "NOTIFICATION_WORKSPACE_NOT_FOUND", "Notification workspace was not found");
    }
    if (!notification.userId) return;
    const selectedUser = await client.query(
      "SELECT id, role, account_status FROM users WHERE id = $1 LIMIT 1 FOR SHARE",
      [notification.userId],
    );
    const targetUser = selectedUser.rows[0] || null;
    const selectedMembership = await client.query(
      `
        SELECT id, role, status
        FROM memberships
        WHERE organization_id = $1
          AND user_id = $2
          AND LOWER(COALESCE(status, 'active')) = 'active'
        LIMIT 1
        FOR SHARE
      `,
      [notification.organizationId, notification.userId],
    );
    const activeMembership = selectedMembership.rows[0] || null;
    const ownsWorkspace = Boolean(
      String(workspace.owner_user_id || "") === notification.userId &&
      activeMembership &&
      WORKSPACE_OWNER_MEMBERSHIP_ROLES.has(String(activeMembership.role || "").toLowerCase()),
    );
    const platformAdmin = ["admin", "platform_admin"].includes(String(targetUser?.role || ""));
    if (
      !targetUser ||
      String(targetUser.account_status || "active") !== "active" ||
      (!activeMembership && !ownsWorkspace && !platformAdmin)
    ) {
      throw repositoryError(
        409,
        "NOTIFICATION_AUDIENCE_TENANT_MISMATCH",
        "Notification user is not an active member of its workspace",
      );
    }
  }

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
        sentAt: input.sentAt || "",
        failedAt: input.failedAt || "",
        retryCount: Number(input.retryCount || 0),
        errorMessage: input.errorMessage || "",
        campaignId: input.campaignId || "",
        audienceType: input.audienceType || "legacy",
        audienceRole: input.audienceRole || "",
        requestedChannels:
          Array.isArray(input.requestedChannels) && input.requestedChannels.length > 0
            ? [...input.requestedChannels]
            : [input.channel || "in_app"],
        inAppStatus: input.inAppStatus || "ready",
        emailStatus: input.emailStatus || "skipped",
        emailErrorMessage: input.emailErrorMessage || "",
        pushStatus: input.pushStatus || "ready",
        pushSentAt: input.pushSentAt || "",
        pushFailedAt: input.pushFailedAt || "",
        pushErrorMessage: input.pushErrorMessage || "",
        pushAttempts: Array.isArray(input.pushAttempts) ? input.pushAttempts : [],
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
        read: Boolean(input.read),
        readAt: input.readAt || "",
        createdAt: input.createdAt || nowIso(),
        updatedAt: nowIso(),
      };
      if (getPool()) {
        await withSqlTransaction(async (client) => {
          await assertSqlNotificationAudience(client, notification);
          await queryUpsertNotification(client, notification);
        });
      } else {
        assertRuntimeNotificationAudience(notification);
      }
      syncArrayItem(getDb().notifications, notification);
      getDb().notifications = getDb().notifications.slice(0, 200);
      await saveDb();
      return notification;
    },

    async createCampaignWithAudit(input = {}, auditInput = {}, idempotencyInput = null) {
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      if (!idempotency) {
        throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
      }
      const requestedChannels = Array.from(
        new Set((Array.isArray(input.requestedChannels) ? input.requestedChannels : []).map(String)),
      ).filter((channel) => ["in_app", "email", "push"].includes(channel));
      const recipients = Array.isArray(input.recipients) ? input.recipients : [];
      const organizationId = String(input.organizationId || "");
      const campaignId = String(input.campaignId || createId("notification_campaign"));
      const audience = input.audience && typeof input.audience === "object" ? cloneRuntimeValue(input.audience) : {};
      if (
        !organizationId ||
        !String(input.actorUserId || "") ||
        !String(input.title || "").trim() ||
        !String(input.message || "").trim() ||
        requestedChannels.length === 0 ||
        recipients.length === 0 ||
        recipients.length > 200
      ) {
        throw repositoryError(
          400,
          "NOTIFICATION_CAMPAIGN_INVALID",
          "Notification campaign requires one workspace, one or more channels and 1-200 recipients",
        );
      }
      const seenUsers = new Set();
      const createdAt = String(input.createdAt || nowIso());
      const notifications = recipients.map((recipient) => {
        const userId = String(recipient?.userId || "");
        if (!userId || seenUsers.has(userId)) {
          throw repositoryError(
            400,
            "NOTIFICATION_CAMPAIGN_RECIPIENT_INVALID",
            "Notification campaign recipients must contain unique backend user ids",
          );
        }
        seenUsers.add(userId);
        const inAppStatus = requestedChannels.includes("in_app") ? "ready" : "skipped";
        const emailStatus = requestedChannels.includes("email")
          ? String(recipient.emailStatus || "unavailable")
          : "skipped";
        const pushStatus = requestedChannels.includes("push")
          ? String(recipient.pushStatus || "unavailable")
          : "skipped";
        return {
          id: createId("noti"),
          campaignId,
          userId,
          organizationId,
          audienceType: String(audience.type || "users"),
          audienceRole: String(audience.role || ""),
          requestedChannels: [...requestedChannels],
          type: String(input.type || "info"),
          title: String(input.title || "").trim(),
          message: String(input.message || "").trim(),
          channel: requestedChannels[0],
          inAppStatus,
          emailStatus,
          emailErrorMessage: String(recipient.emailErrorMessage || ""),
          deliveryStatus: emailStatus,
          pushStatus,
          pushErrorMessage: String(recipient.pushErrorMessage || ""),
          pushAttempts: [],
          metadata: {
            ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
            campaignId,
            audienceType: String(audience.type || "users"),
            audienceRole: String(audience.role || ""),
            recipientCount: recipients.length,
          },
          read: false,
          createdAt,
          updatedAt: createdAt,
        };
      });

      const summarize = (field) => {
        const counts = {};
        for (const notification of notifications) {
          const status = String(notification[field] || "skipped");
          counts[status] = Number(counts[status] || 0) + 1;
        }
        return counts;
      };
      const channelSummary = {
        in_app: summarize("inAppStatus"),
        email: summarize("emailStatus"),
        push: summarize("pushStatus"),
      };
      const requestedStatuses = notifications.flatMap((notification) =>
        requestedChannels.map((channel) =>
          channel === "in_app"
            ? notification.inAppStatus
            : channel === "email"
              ? notification.emailStatus
              : notification.pushStatus,
        ),
      );
      const hasReady = requestedStatuses.some((status) => ["ready", "sent", "partial"].includes(status));
      const hasUnavailable = requestedStatuses.some((status) =>
        ["disabled", "failed", "no_devices", "no_recipient", "skipped", "unavailable"].includes(status),
      );
      const campaign = {
        id: campaignId,
        operationId: campaignId,
        organizationId,
        audience,
        requestedChannels,
        recipientCount: notifications.length,
        notificationIds: notifications.map((notification) => notification.id),
        channelSummary,
        status: hasReady && hasUnavailable ? "partial" : hasReady ? "ready" : "unavailable",
        createdAt,
      };
      const response = { campaign, notifications };
      const auditLog = createAuditLog({
        ...auditInput,
        organizationId,
        action: auditInput.action || "notification.campaign.create",
        resourceType: "notification_campaign",
        resourceId: campaignId,
        metadata: {
          ...(auditInput.metadata || {}),
          audience,
          requestedChannels,
          recipientCount: notifications.length,
          channelSummary,
        },
      });

      if (!getPool()) {
        return runNotificationCampaignMutationExclusive(idempotency, async () => {
          const existing = findRuntimeIdempotency(idempotency);
          if (existing) {
            assertIdempotencyFingerprint(existing, idempotency);
            existing.lastSeenAt = nowIso();
            const replay = cloneRuntimeValue(existing.responseResource || {});
            if (!replay.campaign?.id || !Array.isArray(replay.notifications)) {
              throw repositoryError(
                409,
                "IDEMPOTENT_NOTIFICATION_CAMPAIGN_MISSING",
                "The original notification campaign result is no longer available",
              );
            }
            await saveDb();
            return { ...replay, auditLog: null, replayed: true, responseStatus: Number(existing.responseStatus || 201) };
          }
          const runtimeDb = getDb();
          const before = snapshotRuntimeDb(runtimeDb);
          try {
            runtimeDb.notifications = Array.isArray(runtimeDb.notifications) ? runtimeDb.notifications : [];
            for (const notification of notifications) {
              assertRuntimeNotificationAudience(notification);
              syncArrayItem(runtimeDb.notifications, notification);
            }
            runtimeDb.notifications = runtimeDb.notifications.slice(0, 200);
            syncRuntimeAuditLog(auditLog);
            syncRuntimeMutationIdempotency(
              idempotency,
              "notification_campaign",
              campaignId,
              201,
              response,
            );
            await saveDb();
          } catch (error) {
            restoreRuntimeDb(runtimeDb, before);
            throw error;
          }
          return { ...response, auditLog, replayed: false, responseStatus: 201 };
        });
      }

      const result = await withSqlTransaction(async (client) => {
        const replayEntry = await findSqlMutationReplay(client, idempotency);
        if (replayEntry) {
          const replay = cloneRuntimeValue(replayEntry.response_json || {});
          if (!replay.campaign?.id || !Array.isArray(replay.notifications)) {
            throw repositoryError(
              409,
              "IDEMPOTENT_NOTIFICATION_CAMPAIGN_MISSING",
              "The original notification campaign result is no longer available",
            );
          }
          return { ...replay, auditLog: null, replayed: true, responseStatus: Number(replayEntry.response_status || 201) };
        }
        for (const notification of notifications) {
          await assertSqlNotificationAudience(client, notification);
          await queryUpsertNotification(client, notification);
        }
        await queryInsertAuditLog(client, auditLog);
        await insertSqlMutationIdempotency(
          client,
          idempotency,
          "notification_campaign",
          campaignId,
          201,
          response,
        );
        return { ...response, auditLog, replayed: false, responseStatus: 201 };
      });
      const runtimeDb = getDb();
      runtimeDb.notifications = Array.isArray(runtimeDb.notifications) ? runtimeDb.notifications : [];
      for (const notification of result.notifications) syncArrayItem(runtimeDb.notifications, notification);
      runtimeDb.notifications = runtimeDb.notifications.slice(0, 200);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(
        idempotency,
        "notification_campaign",
        result.campaign.id,
        result.responseStatus,
        { campaign: result.campaign, notifications: result.notifications },
      );
      await saveDb();
      return result;
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

  const authSessions = {
    async revokeAllForUser(userId, auditInput = {}) {
      const actorId = String(userId || "");
      if (!actorId) throw repositoryError(400, "AUTH_SESSION_INVALID", "User id is required");
      const revokedAt = nowIso();
      let sqlSessions = [];
      let firebaseSessionsRevoked = 0;
      let auditLog = null;
      if (getPool()) {
        const result = await withSqlTransaction(async (client) => {
          await client.query("SELECT id FROM users WHERE id = $1 LIMIT 1 FOR UPDATE", [actorId]);
          const revoked = await client.query(
            `
              UPDATE auth_sessions
              SET revoked_at = COALESCE(revoked_at, $2::timestamptz), last_seen_at = now()
              WHERE user_id = $1 AND revoked_at IS NULL
              RETURNING *
            `,
            [actorId, revokedAt],
          );
          const log = createAuditLog({
            ...auditInput,
            actorUserId: auditInput.actorUserId || actorId,
            action: auditInput.action || "auth.session.revoke_all",
            resourceType: "user",
            resourceId: actorId,
            metadata: {
              ...(auditInput.metadata || {}),
              firebaseSessionsRevoked: revoked.rows.length,
            },
          });
          await queryInsertAuditLog(client, log);
          const allSessions = await client.query("SELECT * FROM auth_sessions WHERE user_id = $1", [actorId]);
          return {
            sessions: allSessions.rows.map(rowToAuthSession),
            revokedCount: revoked.rows.length,
            auditLog: log,
          };
        });
        sqlSessions = result.sessions;
        firebaseSessionsRevoked = result.revokedCount;
        auditLog = result.auditLog;
      } else {
        auditLog = createAuditLog({
          ...auditInput,
          actorUserId: auditInput.actorUserId || actorId,
          action: auditInput.action || "auth.session.revoke_all",
          resourceType: "user",
          resourceId: actorId,
        });
      }

      let demoSessionsRevoked = 0;
      let runtimeFirebaseSessionsRevoked = 0;
      getDb().sessions = (getDb().sessions || []).map((session) => {
        if (session.userId === actorId && !session.revokedAt) {
          demoSessionsRevoked += 1;
          return { ...session, revokedAt };
        }
        return session;
      });
      getDb().authSessions = (getDb().authSessions || []).map((session) => {
        if (session.userId === actorId && !session.revokedAt) runtimeFirebaseSessionsRevoked += 1;
        const canonical = sqlSessions.find((item) => item.id === session.id);
        return canonical || (session.userId === actorId ? { ...session, revokedAt: session.revokedAt || revokedAt } : session);
      });
      for (const session of sqlSessions) syncArrayItem(getDb().authSessions, session);
      if (auditLog) syncRuntimeAuditLog(auditLog);
      await saveDb();
      return {
        revokedAt,
        demoSessionsRevoked,
        firebaseSessionsRevoked: getPool() ? firebaseSessionsRevoked : runtimeFirebaseSessionsRevoked,
        sessions: sqlSessions,
        auditLog,
      };
    },

    async resolveFirebaseSession(session) {
      if (!session || !session.userId || !session.sessionKey) {
        throw repositoryError(400, "AUTH_SESSION_INVALID", "Auth session is incomplete");
      }
      const runtimeBindings = (getDb().authSessions || []).filter(
        (item) => item.userId === session.userId && item.sessionKey === session.sessionKey,
      );
      let resolved = runtimeBindings.find((item) => item.revokedAt) || runtimeBindings[0] || null;
      if (getPool()) {
        resolved = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `auth-session:${session.userId}:${session.sessionKey}`,
          ]);
          const existing = await client.query(
            `
              SELECT * FROM auth_sessions
              WHERE user_id = $1 AND refresh_token_hash = $2
              ORDER BY revoked_at DESC NULLS LAST, created_at ASC, id ASC
              FOR UPDATE
            `,
            [session.userId, session.sessionKey],
          );
          if (existing.rows.length > 0) {
            const bindings = existing.rows.map(rowToAuthSession);
            const canonical = bindings.find((item) => item.revokedAt) || bindings[0];
            if (!canonical.revokedAt) {
              canonical.lastSeenAt = session.lastSeenAt || nowIso();
              canonical.ip = session.ip || canonical.ip;
              await queryUpsertAuthSession(client, canonical);
            }
            return canonical;
          }
          await queryUpsertAuthSession(client, session);
          return session;
        });
      } else if (!resolved) {
        resolved = session;
      } else if (!resolved.revokedAt) {
        resolved.lastSeenAt = session.lastSeenAt || nowIso();
        resolved.ip = session.ip || resolved.ip;
      }
      getDb().authSessions = Array.isArray(getDb().authSessions) ? getDb().authSessions : [];
      syncArrayItem(getDb().authSessions, resolved);
      await saveDb();
      return resolved;
    },

    async isActiveForUser(userId, sessionId) {
      const actorId = String(userId || "");
      const id = String(sessionId || "");
      const demoSession = (getDb().sessions || []).find(
        (item) => item.id === id && item.userId === actorId,
      );
      if (demoSession) return !demoSession.revokedAt;

      const runtimeSession = (getDb().authSessions || []).find(
        (item) => item.id === id && item.userId === actorId,
      );
      if (getPool()) {
        try {
          const selected = await getPool().query(
            "SELECT user_id, refresh_token_hash FROM auth_sessions WHERE id = $1 AND user_id = $2 LIMIT 1",
            [id, actorId],
          );
          if (!selected.rows[0]) return false;
          const binding = await getPool().query(
            `
              SELECT COUNT(*)::int AS binding_count,
                     COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS revoked_count
              FROM auth_sessions
              WHERE user_id = $1 AND refresh_token_hash = $2
            `,
            [actorId, selected.rows[0].refresh_token_hash],
          );
          return Number(binding.rows[0]?.binding_count || 0) > 0 && Number(binding.rows[0]?.revoked_count || 0) === 0;
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "AUTH_SESSION_STORAGE_UNAVAILABLE", "Auth session storage is unavailable");
        }
      }
      if (!runtimeSession) return false;
      const binding = (getDb().authSessions || []).filter(
        (item) => item.userId === actorId && item.sessionKey === runtimeSession.sessionKey,
      );
      return binding.length > 0 && binding.every((item) => !item.revokedAt);
    },

    async touch(session) {
      if (!session || !session.id || !session.userId || !session.sessionKey) {
        throw repositoryError(400, "AUTH_SESSION_INVALID", "Auth session is incomplete");
      }
      if (getPool()) {
        await withSqlTransaction((client) => queryUpsertAuthSession(client, session));
      }
      getDb().authSessions = Array.isArray(getDb().authSessions) ? getDb().authSessions : [];
      syncArrayItem(getDb().authSessions, session);
      await saveDb();
      return session;
    },

    async listForUser(userId) {
      const id = String(userId || "");
      let firebaseSessions = [];
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM auth_sessions WHERE user_id = $1 ORDER BY last_seen_at DESC, created_at ASC, id ASC",
            [id],
          );
          const bindings = new Map();
          for (const session of result.rows.map(rowToAuthSession)) {
            const items = bindings.get(session.sessionKey) || [];
            items.push(session);
            bindings.set(session.sessionKey, items);
          }
          firebaseSessions = [...bindings.values()]
            .filter((items) => items.every((item) => !item.revokedAt))
            .map((items) => items[0]);
          getDb().authSessions = getDb().authSessions.filter((item) => item.userId !== id);
          for (const session of result.rows.map(rowToAuthSession)) syncArrayItem(getDb().authSessions, session);
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "AUTH_SESSION_STORAGE_UNAVAILABLE", "Auth session storage is unavailable");
        }
      } else {
        const bindings = new Map();
        for (const session of (getDb().authSessions || []).filter((item) => item.userId === id)) {
          const items = bindings.get(session.sessionKey) || [];
          items.push(session);
          bindings.set(session.sessionKey, items);
        }
        firebaseSessions = [...bindings.values()]
          .filter((items) => items.every((item) => !item.revokedAt))
          .map((items) => items[0]);
      }
      const demoSessions = (getDb().sessions || []).filter((item) => item.userId === id && !item.revokedAt);
      return [...firebaseSessions, ...demoSessions];
    },

    async revokeForUser(userId, sessionId, auditInput = {}) {
      const actorId = String(userId || "");
      const id = String(sessionId || "");
      const demoSession = (getDb().sessions || []).find((item) => item.id === id && item.userId === actorId) || null;
      if (demoSession) {
        if (demoSession.revokedAt) return { session: demoSession, auditLog: null, replayed: true };
        demoSession.revokedAt = nowIso();
        const auditLog = createAuditLog({
          ...auditInput,
          actorUserId: actorId,
          action: auditInput.action || "auth.session.revoke",
          resourceType: "auth_session",
          resourceId: id,
        });
        syncRuntimeAuditLog(auditLog);
        await saveDb();
        return { session: demoSession, auditLog, replayed: false };
      }

      if (!getPool()) {
        const session = (getDb().authSessions || []).find((item) => item.id === id && item.userId === actorId) || null;
        if (!session) return null;
        const binding = (getDb().authSessions || []).filter(
          (item) => item.userId === actorId && item.sessionKey === session.sessionKey,
        );
        const previousRevocation = binding.find((item) => item.revokedAt)?.revokedAt || "";
        const revokedAt = previousRevocation || nowIso();
        for (const item of binding) item.revokedAt = item.revokedAt || revokedAt;
        if (previousRevocation) return { session: { ...session, revokedAt }, auditLog: null, replayed: true };
        const auditLog = createAuditLog({
          ...auditInput,
          actorUserId: actorId,
          action: auditInput.action || "auth.session.revoke",
          resourceType: "auth_session",
          resourceId: id,
        });
        syncRuntimeAuditLog(auditLog);
        await saveDb();
        return { session, auditLog, replayed: false };
      }

      const result = await withSqlTransaction(async (client) => {
        const selected = await client.query(
          "SELECT * FROM auth_sessions WHERE id = $1 AND user_id = $2",
          [id, actorId],
        );
        if (!selected.rows[0]) return null;
        const session = rowToAuthSession(selected.rows[0]);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `auth-session:${actorId}:${session.sessionKey}`,
        ]);
        const binding = await client.query(
          `
            SELECT * FROM auth_sessions
            WHERE user_id = $1 AND refresh_token_hash = $2
            ORDER BY revoked_at DESC NULLS LAST, created_at ASC, id ASC
            FOR UPDATE
          `,
          [actorId, session.sessionKey],
        );
        const previousRevocation = binding.rows.map(rowToAuthSession).find((item) => item.revokedAt)?.revokedAt || "";
        session.revokedAt = previousRevocation || nowIso();
        if (previousRevocation) return { session, auditLog: null, replayed: true };
        await client.query(
          `
            UPDATE auth_sessions
            SET revoked_at = $3::timestamptz, last_seen_at = now()
            WHERE user_id = $1 AND refresh_token_hash = $2
          `,
          [actorId, session.sessionKey, session.revokedAt],
        );
        const auditLog = createAuditLog({
          ...auditInput,
          actorUserId: actorId,
          action: auditInput.action || "auth.session.revoke",
          resourceType: "auth_session",
          resourceId: id,
        });
        await queryInsertAuditLog(client, auditLog);
        return { session, auditLog, replayed: false };
      });
      if (!result) return null;
      getDb().authSessions = Array.isArray(getDb().authSessions) ? getDb().authSessions : [];
      syncArrayItem(getDb().authSessions, result.session);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      await saveDb();
      return result;
    },
  };

  const identityOperations = {
    async begin(input = {}) {
      if (!getPool() && !input.__identityMutationExclusive) {
        return runManagedAdminCreateExclusive(() => identityOperations.begin({
          ...input,
          __identityMutationExclusive: true,
        }));
      }
      const targetUserId = String(input.targetUserId || "");
      const actorUserId = String(input.actorUserId || "");
      const organizationId = String(input.organizationId || "");
      const operation = String(input.operation || "");
      const idempotencyKey = String(input.idempotencyKey || "");
      const requestFingerprint = String(input.requestFingerprint || "");
      const requestedTargetState = objectOf(input.targetState);
      const targetState = operation === "change_role"
        ? {
            role: String(requestedTargetState.role || "").trim(),
            requestedRole: String(requestedTargetState.requestedRole || requestedTargetState.role || "").trim(),
            roleRequestStatus: String(requestedTargetState.roleRequestStatus || "approved").trim(),
            organizationId: String(requestedTargetState.organizationId || organizationId || "").trim(),
            accountStatus: String(requestedTargetState.accountStatus || "active").trim(),
            hospital: String(requestedTargetState.hospital || "").trim(),
          }
        : {};
      const operationOrganizationId = operation === "change_role" ? targetState.organizationId : organizationId;
      const protectLastPlatformAdmin = Boolean(input.protectLastPlatformAdmin) && ["lock", "delete", "change_role"].includes(operation);
      if (!targetUserId || !actorUserId || !idempotencyKey || !requestFingerprint) {
        throw repositoryError(400, "IDENTITY_OPERATION_INVALID", "Identity operation context is incomplete");
      }
      if (!["lock", "unlock", "delete", "reset_password", "change_role"].includes(operation)) {
        throw repositoryError(400, "IDENTITY_OPERATION_INVALID", "Identity operation is not supported");
      }
      if (operation === "change_role") {
        const supportedRoles = new Set([
          "admin", "platform_admin", "workspace_owner", "workspace_admin", "doctor",
          "patient", "nurse", "technician", "billing", "viewer",
        ]);
        if (
          !supportedRoles.has(targetState.role) ||
          !supportedRoles.has(targetState.requestedRole) ||
          targetState.requestedRole !== targetState.role ||
          targetState.roleRequestStatus !== "approved" ||
          !targetState.organizationId ||
          targetState.accountStatus !== "active"
        ) {
          throw repositoryError(400, "IDENTITY_ROLE_TARGET_INVALID", "Role transition target state is invalid");
        }
      }
      const pendingAccountStatus = {
        lock: "locked",
        unlock: "unlock_pending",
        delete: "deletion_pending",
        reset_password: "password_reset_pending",
        change_role: "role_change_pending",
      }[operation];
      const revokeSessions = operation !== "unlock";
      let result;

      if (getPool()) {
        result = await withSqlTransaction(async (client) => {
          if (protectLastPlatformAdmin) {
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["identity-operation:platform-admin-guard"]);
          }
          if (requiresWorkspaceOwnerGuard(operation, targetState)) {
            await queryLockWorkspaceOwnerMutation(client);
          }
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`identity-operation:${targetUserId}`]);
          const existing = await client.query(
            `
              SELECT * FROM identity_operations
              WHERE target_user_id = $1 AND operation = $2 AND idempotency_key = $3
              LIMIT 1 FOR UPDATE
            `,
            [targetUserId, operation, idempotencyKey],
          );
          if (existing.rows[0]) {
            const identityOperation = rowToIdentityOperation(existing.rows[0]);
            if (identityOperation.requestFingerprint !== requestFingerprint) {
              throw repositoryError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with a different identity request");
            }
            if (identityOperation.status !== "completed") {
              if (identityOperation.operation === "change_role") {
                await assertSqlOperationalWorkspace(client, identityOperation.targetState);
              }
              await queryAssertWorkspaceOwnerTransition(
                client,
                targetUserId,
                identityOperation.operation,
                identityOperation.targetState,
              );
            }
            const selectedUser = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [targetUserId]);
            return {
              identityOperation,
              user: selectedUser.rows[0] ? rowToUser(selectedUser.rows[0]) : null,
              revokedCount: 0,
              auditLog: null,
              replayed: true,
            };
          }

          const unresolved = await client.query(
            `
              SELECT id, operation
              FROM identity_operations
              WHERE target_user_id = $1
                AND status IN ('pending_provider', 'provider_applied', 'provider_failed')
              ORDER BY created_at DESC
              LIMIT 1
              FOR UPDATE
            `,
            [targetUserId],
          );
          if (unresolved.rows[0]) {
            throw repositoryError(
              409,
              "IDENTITY_OPERATION_IN_PROGRESS",
              "Another identity operation must be completed or retried first",
              { operationId: unresolved.rows[0].id, operation: unresolved.rows[0].operation },
            );
          }

          const selected = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE", [targetUserId]);
          if (!selected.rows[0]) {
            throw repositoryError(404, "ACCOUNT_NOT_FOUND", "Account no longer exists");
          }
          const previousUser = rowToUser(selected.rows[0]);
          if (protectLastPlatformAdmin && ["admin", "platform_admin"].includes(previousUser.role)) {
            const remainingAdmins = await client.query(
              `
                SELECT COUNT(*)::integer AS count
                FROM users
                WHERE id <> $1
                  AND role IN ('admin', 'platform_admin')
                  AND COALESCE(account_status, 'active') = 'active'
              `,
              [targetUserId],
            );
            if (Number(remainingAdmins.rows[0]?.count || 0) === 0) {
              throw repositoryError(
                409,
                "LAST_PLATFORM_ADMIN_REQUIRED",
                "The last active platform administrator cannot be locked, deleted, or demoted",
              );
            }
          }
          if (operation === "change_role") {
            await assertSqlOperationalWorkspace(client, targetState);
          }
          await queryAssertWorkspaceOwnerTransition(client, targetUserId, operation, targetState);
          const updated = await client.query(
            "UPDATE users SET account_status = $2, updated_at = now() WHERE id = $1 RETURNING *",
            [targetUserId, pendingAccountStatus],
          );
          let revokedCount = 0;
          if (revokeSessions) {
            const revoked = await client.query(
              `
                UPDATE auth_sessions
                SET revoked_at = COALESCE(revoked_at, now()), last_seen_at = now()
                WHERE user_id = $1 AND revoked_at IS NULL
                RETURNING id
              `,
              [targetUserId],
            );
            revokedCount = revoked.rows.length;
          }
          const operationId = createId("identityop");
          const inserted = await client.query(
            `
              INSERT INTO identity_operations (
                id, target_user_id, actor_user_id, organization_id, operation, status,
                idempotency_key, request_fingerprint, previous_account_status,
                target_account_status, target_state, provider_status, provider_result, created_at, updated_at
              )
              VALUES ($1, $2, $3, NULLIF($4, ''), $5, 'pending_provider', $6, $7, $8, $9, $10::jsonb, 'pending', '{}'::jsonb, now(), now())
              RETURNING *
            `,
            [
              operationId,
              targetUserId,
              actorUserId,
              operationOrganizationId,
              operation,
              idempotencyKey,
              requestFingerprint,
              previousUser.accountStatus || "active",
              pendingAccountStatus,
              JSON.stringify(targetState),
            ],
          );
          const auditLog = createAuditLog({
            actorUserId,
            organizationId: operationOrganizationId,
            action: `identity.${operation}.intent`,
            resourceType: "user",
            resourceId: targetUserId,
            ip: input.ip || "",
            userAgent: input.userAgent || "",
            metadata: { operationId, revokedCount, pendingAccountStatus },
          });
          await queryInsertAuditLog(client, auditLog);
          return {
            identityOperation: rowToIdentityOperation(inserted.rows[0]),
            user: rowToUser(updated.rows[0]),
            revokedCount,
            auditLog,
            replayed: false,
          };
        });
      } else {
        const runtimeDb = getDb();
        runtimeDb.identityOperations = Array.isArray(runtimeDb.identityOperations) ? runtimeDb.identityOperations : [];
        const existing = runtimeDb.identityOperations.find(
          (item) => item.targetUserId === targetUserId && item.operation === operation && item.idempotencyKey === idempotencyKey,
        );
        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            throw repositoryError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with a different identity request");
          }
          if (existing.status !== "completed") {
            if (existing.operation === "change_role") {
              assertRuntimeOperationalWorkspace(runtimeDb, existing.targetState);
            }
            assertRuntimeWorkspaceOwnerTransition(runtimeDb, targetUserId, existing.operation, existing.targetState);
          }
          return {
            identityOperation: existing,
            user: runtimeDb.users.find((item) => item.id === targetUserId) || null,
            revokedCount: 0,
            auditLog: null,
            replayed: true,
          };
        }
        const unresolved = runtimeDb.identityOperations.find(
          (item) => item.targetUserId === targetUserId && ["pending_provider", "provider_applied", "provider_failed"].includes(item.status),
        );
        if (unresolved) {
          throw repositoryError(
            409,
            "IDENTITY_OPERATION_IN_PROGRESS",
            "Another identity operation must be completed or retried first",
            { operationId: unresolved.id, operation: unresolved.operation },
          );
        }
        const user = runtimeDb.users.find((item) => item.id === targetUserId);
        if (!user) throw repositoryError(404, "ACCOUNT_NOT_FOUND", "Account no longer exists");
        if (protectLastPlatformAdmin && ["admin", "platform_admin"].includes(user.role)) {
          const remainingAdmins = runtimeDb.users.filter(
            (item) => item.id !== targetUserId && ["admin", "platform_admin"].includes(item.role) && (item.accountStatus || "active") === "active",
          );
          if (remainingAdmins.length === 0) {
            throw repositoryError(
              409,
              "LAST_PLATFORM_ADMIN_REQUIRED",
              "The last active platform administrator cannot be locked, deleted, or demoted",
            );
          }
        }
        if (operation === "change_role") {
          assertRuntimeOperationalWorkspace(runtimeDb, targetState);
        }
        assertRuntimeWorkspaceOwnerTransition(runtimeDb, targetUserId, operation, targetState);
        const previousAccountStatus = user.accountStatus || "active";
        user.accountStatus = pendingAccountStatus;
        user.updatedAt = nowIso();
        let revokedCount = 0;
        let demoSessionsRevoked = 0;
        if (revokeSessions) {
          runtimeDb.authSessions = (runtimeDb.authSessions || []).map((session) => {
            if (session.userId === targetUserId && !session.revokedAt) {
              revokedCount += 1;
              return { ...session, revokedAt: nowIso() };
            }
            return session;
          });
          runtimeDb.sessions = (runtimeDb.sessions || []).map((session) => {
            if (session.userId === targetUserId && !session.revokedAt) {
              demoSessionsRevoked += 1;
              return { ...session, revokedAt: nowIso() };
            }
            return session;
          });
        }
        const identityOperation = {
          id: createId("identityop"), targetUserId, actorUserId, organizationId: operationOrganizationId, operation,
          status: "pending_provider", idempotencyKey, requestFingerprint,
          previousAccountStatus, targetAccountStatus: pendingAccountStatus,
          targetState,
          providerStatus: "pending", providerResult: {}, errorCode: "",
          createdAt: nowIso(), updatedAt: nowIso(), completedAt: "",
        };
        runtimeDb.identityOperations.unshift(identityOperation);
        const auditLog = createAuditLog({
          actorUserId, organizationId: operationOrganizationId, action: `identity.${operation}.intent`,
          resourceType: "user", resourceId: targetUserId,
          ip: input.ip || "", userAgent: input.userAgent || "",
          metadata: { operationId: identityOperation.id, revokedCount, pendingAccountStatus },
        });
        syncRuntimeAuditLog(auditLog);
        result = {
          identityOperation,
          user,
          revokedCount,
          demoSessionsRevoked,
          firebaseSessionsRevoked: revokedCount,
          auditLog,
          replayed: false,
        };
      }

      if (result.user) syncArrayItem(getDb().users, result.user);
      if (revokeSessions && getPool()) {
        let demoSessionsRevoked = 0;
        getDb().sessions = (getDb().sessions || []).map((session) => {
          if (session.userId === targetUserId && !session.revokedAt) {
            demoSessionsRevoked += 1;
            return { ...session, revokedAt: nowIso() };
          }
          return session;
        });
        result.demoSessionsRevoked = demoSessionsRevoked;
        result.firebaseSessionsRevoked = result.revokedCount;
      }
      for (const session of getDb().authSessions || []) {
        if (session.userId === targetUserId && revokeSessions && !session.revokedAt) session.revokedAt = nowIso();
      }
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      await saveDb();
      return result;
    },

    async markProviderApplied(input = {}) {
      return this.complete({
        ...input,
        providerSucceeded: true,
        finalizeBackend: false,
      });
    },

    async complete(input = {}) {
      if (!getPool() && !input.__identityMutationExclusive) {
        return runManagedAdminCreateExclusive(() => identityOperations.complete({
          ...input,
          __identityMutationExclusive: true,
        }));
      }
      const operationId = String(input.operationId || "");
      const providerSucceeded = Boolean(input.providerSucceeded);
      const finalizeBackend = input.finalizeBackend !== false;
      const providerStatusProvided = Object.prototype.hasOwnProperty.call(input, "providerStatus");
      let providerStatus = String(input.providerStatus || (providerSucceeded ? "applied" : "failed"));
      const providerResultProvided = Object.prototype.hasOwnProperty.call(input, "providerResult");
      let providerResult = objectOf(input.providerResult);
      const errorCode = String(input.errorCode || "");
      if (!operationId) throw repositoryError(400, "IDENTITY_OPERATION_INVALID", "Identity operation id is required");
      let result;
      const runtimeDb = getPool() ? null : getDb();
      const runtimeSnapshot = runtimeDb ? snapshotRuntimeDb(runtimeDb) : null;

      try {
      if (getPool()) {
        result = await withSqlTransaction(async (client) => {
          const operationLookup = await client.query(
            "SELECT target_user_id, operation, target_state FROM identity_operations WHERE id = $1 LIMIT 1",
            [operationId],
          );
          if (!operationLookup.rows[0]) {
            throw repositoryError(404, "IDENTITY_OPERATION_NOT_FOUND", "Identity operation was not found");
          }
          if (
            requiresWorkspaceOwnerGuard(
              operationLookup.rows[0].operation,
              objectOf(operationLookup.rows[0].target_state),
            )
          ) {
            await queryLockWorkspaceOwnerMutation(client);
          }
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `identity-operation:${operationLookup.rows[0].target_user_id}`,
          ]);
          const selected = await client.query("SELECT * FROM identity_operations WHERE id = $1 LIMIT 1 FOR UPDATE", [operationId]);
          if (!selected.rows[0]) throw repositoryError(404, "IDENTITY_OPERATION_NOT_FOUND", "Identity operation was not found");
          let identityOperation = rowToIdentityOperation(selected.rows[0]);
          if (providerSucceeded && finalizeBackend && !providerStatusProvided) {
            providerStatus = identityOperation.providerStatus || "applied";
          }
          if (providerSucceeded && finalizeBackend && !providerResultProvided) {
            providerResult = identityOperation.providerResult;
          }
          if (identityOperation.status === "completed") {
            const selectedUser = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [identityOperation.targetUserId]);
            return {
              identityOperation,
              user: selectedUser.rows[0] ? rowToUser(selectedUser.rows[0]) : null,
              deleted: identityOperation.operation === "delete",
              auditLog: null,
              replayed: true,
            };
          }
          const conflicting = await client.query(
            `
              SELECT id, operation
              FROM identity_operations
              WHERE target_user_id = $1
                AND id <> $2
                AND status IN ('pending_provider', 'provider_applied', 'provider_failed')
              ORDER BY created_at DESC
              LIMIT 1
              FOR UPDATE
            `,
            [identityOperation.targetUserId, operationId],
          );
          if (conflicting.rows[0]) {
            throw repositoryError(
              409,
              "IDENTITY_OPERATION_CONFLICT",
              "A conflicting identity operation prevents this result from being applied",
              { operationId: conflicting.rows[0].id, operation: conflicting.rows[0].operation },
            );
          }
          if (providerSucceeded && !finalizeBackend) {
            if (identityOperation.status === "provider_applied") {
              const selectedUser = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [identityOperation.targetUserId]);
              return {
                identityOperation,
                user: selectedUser.rows[0] ? rowToUser(selectedUser.rows[0]) : null,
                deleted: false,
                auditLog: null,
                replayed: true,
              };
            }
            const applied = await client.query(
              `
                UPDATE identity_operations
                SET status = 'provider_applied', provider_status = $2,
                    provider_result = $3::jsonb, error_code = NULL, updated_at = now()
                WHERE id = $1 RETURNING *
              `,
              [operationId, providerStatus, JSON.stringify(providerResult)],
            );
            identityOperation = rowToIdentityOperation(applied.rows[0]);
            const auditLog = createAuditLog({
              actorUserId: identityOperation.actorUserId,
              organizationId: identityOperation.organizationId,
              action: `identity.${identityOperation.operation}.provider_applied`,
              resourceType: "user",
              resourceId: identityOperation.targetUserId,
              metadata: { operationId, providerStatus },
            });
            await queryInsertAuditLog(client, auditLog);
            const selectedUser = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [identityOperation.targetUserId]);
            return {
              identityOperation,
              user: selectedUser.rows[0] ? rowToUser(selectedUser.rows[0]) : null,
              deleted: false,
              auditLog,
              replayed: false,
            };
          }
          if (!providerSucceeded) {
            if (identityOperation.status === "provider_applied") {
              throw repositoryError(
                409,
                "IDENTITY_PROVIDER_ALREADY_APPLIED",
                "A confirmed provider mutation cannot be changed to failed",
              );
            }
            const failed = await client.query(
              `
                UPDATE identity_operations
                SET status = 'provider_failed', provider_status = $2,
                    provider_result = $3::jsonb, error_code = NULLIF($4, ''), updated_at = now()
                WHERE id = $1 RETURNING *
              `,
              [operationId, providerStatus, JSON.stringify(providerResult), errorCode],
            );
            const auditLog = createAuditLog({
              actorUserId: identityOperation.actorUserId,
              organizationId: identityOperation.organizationId,
              action: `identity.${identityOperation.operation}.provider_failed`,
              resourceType: "user",
              resourceId: identityOperation.targetUserId,
              metadata: { operationId, providerStatus, errorCode },
            });
            await queryInsertAuditLog(client, auditLog);
            return { identityOperation: rowToIdentityOperation(failed.rows[0]), user: null, deleted: false, auditLog, replayed: false };
          }
          if (identityOperation.status !== "provider_applied") {
            throw repositoryError(
              409,
              "IDENTITY_PROVIDER_CONFIRMATION_REQUIRED",
              "The provider result must be persisted before the backend mutation is finalized",
            );
          }

          if (identityOperation.operation === "change_role") {
            await assertSqlOperationalWorkspace(client, identityOperation.targetState);
          }
          await queryAssertWorkspaceOwnerTransition(
            client,
            identityOperation.targetUserId,
            identityOperation.operation,
            identityOperation.targetState,
          );

          let user = null;
          let deleted = false;
          const finalStatus = identityOperation.operation === "lock"
            ? "locked"
            : identityOperation.operation === "change_role"
              ? String(identityOperation.targetState.accountStatus || "active")
              : "active";
          const finalAuditInput = {
            actorUserId: identityOperation.actorUserId,
            organizationId: identityOperation.organizationId,
            action: `identity.${identityOperation.operation}.completed`,
            resourceType: "user",
            resourceId: identityOperation.targetUserId,
            metadata: { operationId, providerStatus },
          };
          if (identityOperation.operation === "delete") {
            user = await queryDeleteUserGraph(client, identityOperation.targetUserId, finalAuditInput);
            deleted = Boolean(user);
            if (!deleted) {
              const priorCompleted = await client.query(
                "SELECT 1 FROM identity_operations WHERE id = $1 AND status = 'completed' LIMIT 1",
                [operationId],
              );
              deleted = Boolean(priorCompleted.rows[0]);
            }
          } else if (identityOperation.operation === "change_role") {
            const roleTarget = identityOperation.targetState;
            if (roleTarget.role === "workspace_admin") {
              const revokedMemberships = await client.query(
                `
                  DELETE FROM memberships
                  WHERE user_id = $1
                    AND organization_id <> $2
                    AND role IN ('workspace_admin', 'admin')
                  RETURNING id, organization_id, role
                `,
                [identityOperation.targetUserId, roleTarget.organizationId],
              );
              for (const membership of revokedMemberships.rows) {
                await queryInsertAuditLog(client, createAuditLog({
                  actorUserId: identityOperation.actorUserId,
                  organizationId: membership.organization_id,
                  action: "membership.role.revoke",
                  resourceType: "membership",
                  resourceId: membership.id,
                  metadata: {
                    userId: identityOperation.targetUserId,
                    previousRole: membership.role,
                    reason: "managed_admin_workspace_transition",
                    targetOrganizationId: roleTarget.organizationId,
                  },
                }));
              }
            }
            if (roleTarget.role !== "doctor") {
              const revokedAccess = await client.query(
                `
                  UPDATE doctor_patient_access
                  SET revoked_at = now(),
                      revoked_by_user_id = $2,
                      updated_at = now()
                  WHERE doctor_user_id = $1
                    AND doctor_id = $1
                    AND revoked_at IS NULL
                    AND (expires_at IS NULL OR expires_at > now())
                  RETURNING id, patient_id, organization_id
                `,
                [identityOperation.targetUserId, identityOperation.actorUserId || null],
              );
              for (const access of revokedAccess.rows) {
                await queryInsertAuditLog(client, createAuditLog({
                  actorUserId: identityOperation.actorUserId,
                  organizationId: access.organization_id || "",
                  action: "patient.share.auto_revoke",
                  resourceType: "patient_share",
                  resourceId: access.id,
                  metadata: {
                    patientId: access.patient_id,
                    doctorUserId: identityOperation.targetUserId,
                    reason: "doctor_role_removed",
                  },
                }));
              }
            }
            const updated = await client.query(
              `
                UPDATE users
                SET role = $2,
                    requested_role = $3,
                    role_request_status = $4,
                    organization_id = $5,
                    account_status = $6,
                    hospital = $7,
                    updated_at = now()
                WHERE id = $1
                RETURNING *
              `,
              [
                identityOperation.targetUserId,
                roleTarget.role,
                roleTarget.requestedRole,
                roleTarget.roleRequestStatus,
                roleTarget.organizationId,
                finalStatus,
                roleTarget.hospital,
              ],
            );
            if (!updated.rows[0]) throw repositoryError(404, "ACCOUNT_NOT_FOUND", "Account no longer exists");
            user = rowToUser(updated.rows[0]);
            await client.query(
              `
                INSERT INTO memberships (id, organization_id, user_id, role, created_at)
                VALUES ($1, $2, $3, $4, now())
                ON CONFLICT (organization_id, user_id)
                DO UPDATE SET role = EXCLUDED.role
              `,
              [createId("mbr"), roleTarget.organizationId, identityOperation.targetUserId, roleTarget.role],
            );
            await queryInsertAuditLog(client, createAuditLog(finalAuditInput));
          } else {
            const updated = await client.query(
              "UPDATE users SET account_status = $2, updated_at = now() WHERE id = $1 RETURNING *",
              [identityOperation.targetUserId, finalStatus],
            );
            if (!updated.rows[0]) throw repositoryError(404, "ACCOUNT_NOT_FOUND", "Account no longer exists");
            user = rowToUser(updated.rows[0]);
            await queryInsertAuditLog(client, createAuditLog(finalAuditInput));
          }
          const completed = await client.query(
            `
              UPDATE identity_operations
              SET status = 'completed', provider_status = $2, provider_result = $3::jsonb,
                  error_code = NULL, completed_at = now(), updated_at = now()
              WHERE id = $1 RETURNING *
            `,
            [operationId, providerStatus, JSON.stringify(providerResult)],
          );
          identityOperation = rowToIdentityOperation(completed.rows[0]);
          return { identityOperation, user, deleted, auditLog: null, replayed: false };
        });
      } else {
        const runtimeDb = getDb();
        runtimeDb.identityOperations = Array.isArray(runtimeDb.identityOperations) ? runtimeDb.identityOperations : [];
        const identityOperation = runtimeDb.identityOperations.find((item) => item.id === operationId);
        if (!identityOperation) throw repositoryError(404, "IDENTITY_OPERATION_NOT_FOUND", "Identity operation was not found");
        if (providerSucceeded && finalizeBackend && !providerStatusProvided) {
          providerStatus = identityOperation.providerStatus || "applied";
        }
        if (providerSucceeded && finalizeBackend && !providerResultProvided) {
          providerResult = identityOperation.providerResult;
        }
        if (identityOperation.status === "completed") {
          return {
            identityOperation,
            user: runtimeDb.users.find((item) => item.id === identityOperation.targetUserId) || null,
            deleted: identityOperation.operation === "delete",
            auditLog: null,
            replayed: true,
          };
        }
        const conflicting = runtimeDb.identityOperations.find(
          (item) => item.id !== operationId && item.targetUserId === identityOperation.targetUserId && ["pending_provider", "provider_applied", "provider_failed"].includes(item.status),
        );
        if (conflicting) {
          throw repositoryError(
            409,
            "IDENTITY_OPERATION_CONFLICT",
            "A conflicting identity operation prevents this result from being applied",
            { operationId: conflicting.id, operation: conflicting.operation },
          );
        }
        if (providerSucceeded && !finalizeBackend) {
          if (identityOperation.status === "provider_applied") {
            return {
              identityOperation,
              user: runtimeDb.users.find((item) => item.id === identityOperation.targetUserId) || null,
              deleted: false,
              auditLog: null,
              replayed: true,
            };
          }
          identityOperation.providerStatus = providerStatus;
          identityOperation.providerResult = providerResult;
          identityOperation.errorCode = "";
          identityOperation.status = "provider_applied";
          identityOperation.updatedAt = nowIso();
          const auditLog = createAuditLog({
            actorUserId: identityOperation.actorUserId,
            organizationId: identityOperation.organizationId,
            action: `identity.${identityOperation.operation}.provider_applied`,
            resourceType: "user",
            resourceId: identityOperation.targetUserId,
            metadata: { operationId, providerStatus },
          });
          syncRuntimeAuditLog(auditLog);
          await saveDb();
          return {
            identityOperation,
            user: runtimeDb.users.find((item) => item.id === identityOperation.targetUserId) || null,
            deleted: false,
            auditLog,
            replayed: false,
          };
        }
        identityOperation.providerStatus = providerStatus;
        identityOperation.providerResult = providerResult;
        identityOperation.errorCode = errorCode;
        identityOperation.updatedAt = nowIso();
        if (!providerSucceeded) {
          if (identityOperation.status === "provider_applied") {
            throw repositoryError(
              409,
              "IDENTITY_PROVIDER_ALREADY_APPLIED",
              "A confirmed provider mutation cannot be changed to failed",
            );
          }
          identityOperation.status = "provider_failed";
          const auditLog = createAuditLog({
            actorUserId: identityOperation.actorUserId,
            organizationId: identityOperation.organizationId,
            action: `identity.${identityOperation.operation}.provider_failed`,
            resourceType: "user",
            resourceId: identityOperation.targetUserId,
            metadata: { operationId, providerStatus, errorCode },
          });
          syncRuntimeAuditLog(auditLog);
          await saveDb();
          return { identityOperation, user: null, deleted: false, auditLog, replayed: false };
        }
        if (identityOperation.status !== "provider_applied") {
          throw repositoryError(
            409,
            "IDENTITY_PROVIDER_CONFIRMATION_REQUIRED",
            "The provider result must be persisted before the backend mutation is finalized",
            );
          }
        if (identityOperation.operation === "change_role") {
          assertRuntimeOperationalWorkspace(runtimeDb, identityOperation.targetState);
        }
        assertRuntimeWorkspaceOwnerTransition(
          runtimeDb,
          identityOperation.targetUserId,
          identityOperation.operation,
          identityOperation.targetState,
        );
        let user = runtimeDb.users.find((item) => item.id === identityOperation.targetUserId) || null;
        let deleted = false;
        if (identityOperation.operation === "delete") {
          deleted = await users.deleteById(identityOperation.targetUserId, { deferSave: true });
          user = null;
        } else if (identityOperation.operation === "change_role") {
          if (!user) throw repositoryError(404, "ACCOUNT_NOT_FOUND", "Account no longer exists");
          const roleTarget = identityOperation.targetState;
          if (roleTarget.role === "workspace_admin") {
            const retainedMemberships = [];
            for (const membership of runtimeDb.memberships || []) {
              const revoke =
                membership.userId === identityOperation.targetUserId &&
                membership.organizationId !== roleTarget.organizationId &&
                ["workspace_admin", "admin"].includes(String(membership.role || ""));
              if (!revoke) {
                retainedMemberships.push(membership);
                continue;
              }
              syncRuntimeAuditLog(createAuditLog({
                actorUserId: identityOperation.actorUserId,
                organizationId: membership.organizationId,
                action: "membership.role.revoke",
                resourceType: "membership",
                resourceId: membership.id,
                metadata: {
                  userId: identityOperation.targetUserId,
                  previousRole: membership.role,
                  reason: "managed_admin_workspace_transition",
                  targetOrganizationId: roleTarget.organizationId,
                },
              }));
            }
            runtimeDb.memberships = retainedMemberships;
          }
          if (user.role === "doctor" && roleTarget.role !== "doctor") {
            for (const grant of runtimeDb.doctorPatientAccess || []) {
              if (
                grant.doctorUserId !== user.id ||
                grant.doctorId !== user.id ||
                !isPatientShareActive(grant)
              ) continue;
              grant.revokedAt = nowIso();
              grant.revokedByUserId = identityOperation.actorUserId || "";
              grant.updatedAt = nowIso();
              syncRuntimeAuditLog(createAuditLog({
                actorUserId: identityOperation.actorUserId,
                organizationId: grant.organizationId || "",
                action: "patient.share.auto_revoke",
                resourceType: "patient_share",
                resourceId: grant.id,
                metadata: {
                  patientId: grant.patientId,
                  doctorUserId: user.id,
                  reason: "doctor_role_removed",
                },
              }));
            }
          }
          user.role = roleTarget.role;
          user.requestedRole = roleTarget.requestedRole;
          user.roleRequestStatus = roleTarget.roleRequestStatus;
          user.organizationId = roleTarget.organizationId;
          user.accountStatus = roleTarget.accountStatus || "active";
          user.hospital = roleTarget.hospital;
          user.updatedAt = nowIso();
          runtimeDb.memberships = Array.isArray(runtimeDb.memberships) ? runtimeDb.memberships : [];
          let membership = runtimeDb.memberships.find(
            (item) => item.userId === identityOperation.targetUserId && item.organizationId === roleTarget.organizationId,
          );
          if (!membership) {
            membership = {
              id: createId("mbr"),
              organizationId: roleTarget.organizationId,
              userId: identityOperation.targetUserId,
              role: roleTarget.role,
              createdAt: nowIso(),
            };
            runtimeDb.memberships.push(membership);
          } else {
            membership.role = roleTarget.role;
          }
        } else {
          if (!user) throw repositoryError(404, "ACCOUNT_NOT_FOUND", "Account no longer exists");
          user.accountStatus = identityOperation.operation === "lock" ? "locked" : "active";
          user.updatedAt = nowIso();
        }
        identityOperation.status = "completed";
        identityOperation.errorCode = "";
        identityOperation.completedAt = nowIso();
        const auditLog = createAuditLog({
          actorUserId: identityOperation.actorUserId,
          organizationId: identityOperation.organizationId,
          action: `identity.${identityOperation.operation}.completed`,
          resourceType: "user",
          resourceId: identityOperation.targetUserId,
          metadata: { operationId, providerStatus },
        });
        syncRuntimeAuditLog(auditLog);
        result = { identityOperation, user, deleted, auditLog, replayed: false };
      }

      if (result.user) syncArrayItem(getDb().users, result.user);
      if (result.deleted) {
        getDb().users = getDb().users.filter((item) => item.id !== result.identityOperation.targetUserId);
      }
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      await saveDb();
      return result;
      } catch (error) {
        if (runtimeDb && runtimeSnapshot) restoreRuntimeDb(runtimeDb, runtimeSnapshot);
        throw error;
      }
    },

    async reconcileProviderApplied(limit = 25) {
      const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 25));
      let operationIds;
      if (getPool()) {
        const selected = await getPool().query(
          `
            SELECT id
            FROM identity_operations
            WHERE status = 'provider_applied'
            ORDER BY updated_at ASC, created_at ASC
            LIMIT $1
          `,
          [boundedLimit],
        );
        operationIds = selected.rows.map((row) => row.id);
      } else {
        operationIds = (getDb().identityOperations || [])
          .filter((item) => item.status === "provider_applied")
          .sort((left, right) => String(left.updatedAt || left.createdAt || "").localeCompare(String(right.updatedAt || right.createdAt || "")))
          .slice(0, boundedLimit)
          .map((item) => item.id);
      }

      const outcomes = [];
      for (const operationId of operationIds) {
        try {
          const completed = await this.complete({
            operationId,
            providerSucceeded: true,
          });
          outcomes.push({ operationId, completed: completed.identityOperation.status === "completed", errorCode: "" });
        } catch (error) {
          outcomes.push({ operationId, completed: false, errorCode: error.code || "IDENTITY_RECONCILIATION_FAILED" });
        }
      }
      return outcomes;
    },
  };

  const patients = {
    async list() {
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM patients WHERE deleted_at IS NULL ORDER BY updated_at DESC, created_at DESC",
          );
          const sqlPatients = result.rows.map(rowToPatient);
          getDb().patients = sqlPatients;
          return sqlPatients;
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "PATIENT_STORAGE_UNAVAILABLE", "Patient storage is unavailable");
        }
      }
      return getDb().patients.filter((patient) => !patient.deletedAt);
    },

    async findById(id) {
      const patientId = String(id || "");
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM patients WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
            [patientId],
          );
          if (!result.rows[0]) {
            getDb().patients = getDb().patients.filter((patient) => patient.id !== patientId);
            return null;
          }
          return syncArrayItem(getDb().patients, rowToPatient(result.rows[0]));
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "PATIENT_STORAGE_UNAVAILABLE", "Patient storage is unavailable");
        }
      }
      return getDb().patients.find((patient) => patient.id === patientId && !patient.deletedAt) || null;
    },

    async save(patient) {
      patient.updatedAt = patient.updatedAt || nowIso();
      syncArrayItem(getDb().patients, patient);
      await upsertPatientSql(patient);
      await saveDb();
      return patient;
    },

    async saveWithAudit(patient, auditInput = {}, idempotencyInput = null, responseStatus = 200) {
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      assertRuntimePatientMutationAuthorization(auditInput.authorization, patient);
      const auditLog = createAuditLog({
        ...auditInput,
        organizationId: auditInput.organizationId || patient.organizationId || "",
        resourceType: "patient",
        resourceId: patient.id,
      });
      if (!getPool()) {
        return runPatientMutationExclusive(async () => {
          const runtimeDb = getDb();
          const snapshot = snapshotRuntimeDb(runtimeDb);
          try {
            const existing = idempotency ? findRuntimeIdempotency(idempotency) : null;
            if (existing) {
              assertIdempotencyFingerprint(existing, idempotency);
              existing.lastSeenAt = nowIso();
              const currentPatient = runtimeDb.patients.find(
                (item) => item.id === existing.resourceId && !item.deletedAt,
              ) || null;
              return {
                patient: currentPatient,
                auditLog: null,
                replayed: true,
                responseStatus: Number(existing.responseStatus || responseStatus),
              };
            }
            syncArrayItem(runtimeDb.patients, patient);
            syncRuntimeAuditLog(auditLog);
            syncRuntimeMutationIdempotency(idempotency, "patient", patient.id, responseStatus, { id: patient.id });
            await saveDb();
            return { patient, auditLog, replayed: false, responseStatus };
          } catch (error) {
            restoreRuntimeDb(runtimeDb, snapshot);
            throw error;
          }
        });
      }

      const result = await withSqlTransaction(async (client) => {
        await assertSqlPatientMutationAuthorization(client, auditInput.authorization, patient);
        const replay = await findSqlMutationReplay(client, idempotency);
        if (replay) {
          const current = await client.query(
            "SELECT * FROM patients WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
            [replay.resource_id || patient.id],
          );
          return {
            patient: current.rows[0] ? rowToPatient(current.rows[0]) : null,
            auditLog: null,
            replayed: true,
            responseStatus: Number(replay.response_status || responseStatus),
          };
        }
        await queryUpsertPatient(client, patient);
        await queryInsertAuditLog(client, auditLog);
        await insertSqlMutationIdempotency(client, idempotency, "patient", patient.id, responseStatus, { id: patient.id });
        return { patient, auditLog, replayed: false, responseStatus };
      });
      if (!result.patient) return result;
      syncArrayItem(getDb().patients, result.patient);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(idempotency, "patient", result.patient.id, result.responseStatus, { id: result.patient.id });
      await saveDb();
      return result;
    },

    async findMutationReplay(idempotencyInput = null) {
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      if (!idempotency) return null;
      if (!getPool()) {
        const replay = findRuntimeIdempotency(idempotency);
        if (!replay) return null;
        assertIdempotencyFingerprint(replay, idempotency);
        return {
          resourceType: replay.resourceType || "",
          resourceId: replay.resourceId || "",
          responseStatus: Number(replay.responseStatus || 200),
          responseResource: cloneRuntimeValue(replay.responseResource || {}),
        };
      }
      const replay = await withSqlTransaction((client) => findSqlMutationReplay(client, idempotency));
      if (!replay) return null;
      return {
        resourceType: replay.resource_type || "",
        resourceId: replay.resource_id || "",
        responseStatus: Number(replay.response_status || 200),
        responseResource: cloneRuntimeValue(replay.response_json || {}),
      };
    },

    async delete(id) {
      const patientId = String(id || "");
      const db = getDb();
      const patient = db.patients.find((item) => item.id === patientId) || null;
      db.patients = db.patients.filter((item) => item.id !== patientId);
      await withSql((pool) => pool.query("UPDATE patients SET deleted_at = now(), updated_at = now() WHERE id = $1", [patientId]));
      await saveDb();
      return patient;
    },

    async deleteWithAudit(id, auditInput = {}, options = {}) {
      const patientId = String(id || "");
      const idempotency = normalizeMutationIdempotency(options.idempotency);
      const runtimePatient = getDb().patients.find((item) => item.id === patientId && !item.deletedAt) || null;
      if (getPool()) {
        const result = await withSqlTransaction(async (client) => {
          const replay = await findSqlMutationReplay(client, idempotency);
          if (replay) {
            return {
              patient: { id: replay.resource_id || patientId },
              auditLog: null,
              replayed: true,
              responseStatus: Number(replay.response_status || 200),
            };
          }
          if (!runtimePatient) return null;
          await assertSqlPatientMutationAuthorization(client, auditInput.authorization, runtimePatient);
          const auditLog = createAuditLog({
            ...auditInput,
            organizationId: auditInput.organizationId || runtimePatient.organizationId || "",
            resourceType: "patient",
            resourceId: patientId,
          });
          const deleted = await client.query(
            "UPDATE patients SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
            [patientId],
          );
          if (!deleted.rows[0]) return null;
          if (options.activeProfileUserId && options.fallbackPatientId) {
            await client.query(
              `
                UPDATE users
                SET firebase_claims = jsonb_set(
                  COALESCE(firebase_claims, '{}'::jsonb),
                  '{profile}',
                  COALESCE(firebase_claims->'profile', '{}'::jsonb) || jsonb_build_object('activePatientId', $2::text),
                  true
                ), updated_at = now()
                WHERE id = $1
                  AND COALESCE(firebase_claims->'profile'->>'activePatientId', '') = $3
              `,
              [options.activeProfileUserId, options.fallbackPatientId, patientId],
            );
          }
          await queryInsertAuditLog(client, auditLog);
          await insertSqlMutationIdempotency(
            client,
            idempotency,
            "patient_delete",
            patientId,
            200,
            { deleted: true, patientId },
          );
          return {
            patient: rowToPatient(deleted.rows[0]),
            auditLog,
            replayed: false,
            responseStatus: 200,
          };
        });
        if (!result) return null;
        getDb().patients = getDb().patients.filter((item) => item.id !== patientId);
        if (options.activeProfileUserId && options.fallbackPatientId) {
          const account = getDb().users.find((item) => item.id === options.activeProfileUserId);
          if (account?.activePatientId === patientId) account.activePatientId = options.fallbackPatientId;
        }
        if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
        syncRuntimeMutationIdempotency(
          idempotency,
          "patient_delete",
          patientId,
          result.responseStatus,
          { deleted: true, patientId },
        );
        await saveDb();
        return result;
      }
      return runPatientMutationExclusive(async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          const replay = idempotency ? findRuntimeIdempotency(idempotency) : null;
          if (replay) {
            assertIdempotencyFingerprint(replay, idempotency);
            replay.lastSeenAt = nowIso();
            return {
              patient: { id: replay.resourceId || patientId },
              auditLog: null,
              replayed: true,
              responseStatus: Number(replay.responseStatus || 200),
            };
          }
          const currentPatient = runtimeDb.patients.find(
            (item) => item.id === patientId && !item.deletedAt,
          ) || null;
          if (!currentPatient) return null;
          assertRuntimePatientMutationAuthorization(auditInput.authorization, currentPatient);
          const auditLog = createAuditLog({
            ...auditInput,
            organizationId: auditInput.organizationId || currentPatient.organizationId || "",
            resourceType: "patient",
            resourceId: patientId,
          });
          runtimeDb.patients = runtimeDb.patients.filter((item) => item.id !== patientId);
          if (options.activeProfileUserId && options.fallbackPatientId) {
            const account = runtimeDb.users.find((item) => item.id === options.activeProfileUserId);
            if (account?.activePatientId === patientId) account.activePatientId = options.fallbackPatientId;
          }
          syncRuntimeAuditLog(auditLog);
          syncRuntimeMutationIdempotency(
            idempotency,
            "patient_delete",
            patientId,
            200,
            { deleted: true, patientId },
          );
          await saveDb();
          return { patient: currentPatient, auditLog, replayed: false, responseStatus: 200 };
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },
  };

  function runtimePatientImportBatches() {
    const runtimeDb = getDb();
    runtimeDb.patientImportBatches = Array.isArray(runtimeDb.patientImportBatches)
      ? runtimeDb.patientImportBatches
      : [];
    return runtimeDb.patientImportBatches;
  }

  function patientImportDuplicateKeys(patient = {}) {
    const keys = [];
    const patientCode = String(patient.patientCode || "").trim().toLowerCase();
    const email = String(patient.email || "").trim().toLowerCase();
    const phone = String(patient.phone || "").replace(/\D/g, "");
    if (patientCode) keys.push(["patientCode", patientCode]);
    if (email) keys.push(["email", email]);
    if (phone) keys.push(["phone", phone]);
    return keys;
  }

  function findPatientImportConflicts(batchRows = [], existingPatients = []) {
    const existing = new Map();
    for (const patient of existingPatients) {
      if (!patient || patient.deletedAt) continue;
      for (const [field, value] of patientImportDuplicateKeys(patient)) {
        existing.set(`${field}:${value}`, patient.id || "existing");
      }
    }
    const conflicts = [];
    for (const row of batchRows) {
      for (const [field, value] of patientImportDuplicateKeys(row?.patient || {})) {
        const existingPatientId = existing.get(`${field}:${value}`);
        if (existingPatientId) {
          conflicts.push({
            rowNumber: Number(row?.rowNumber || 0),
            field,
            existingPatientId,
          });
        }
      }
    }
    return conflicts;
  }

  function assertPatientImportBatchReady(batch) {
    if (!batch) {
      throw repositoryError(404, "PATIENT_IMPORT_BATCH_NOT_FOUND", "Patient import batch was not found");
    }
    if (Date.parse(batch.expiresAt || "") <= Date.now()) {
      throw repositoryError(410, "PATIENT_IMPORT_BATCH_EXPIRED", "Patient import batch has expired");
    }
    if (batch.status === "committed") {
      throw repositoryError(409, "PATIENT_IMPORT_ALREADY_COMMITTED", "Patient import batch was already committed");
    }
    if (batch.status !== "validated" || Number(batch.invalidCount || 0) > 0) {
      throw repositoryError(
        409,
        "PATIENT_IMPORT_BATCH_INVALID",
        "Patient import batch contains invalid or duplicate rows",
        { invalidCount: Number(batch.invalidCount || 0), duplicateCount: Number(batch.duplicateCount || 0) },
      );
    }
    if (!Array.isArray(batch.rows) || batch.rows.length !== Number(batch.rowCount || 0)) {
      throw repositoryError(409, "PATIENT_IMPORT_BATCH_CORRUPT", "Patient import batch rows are incomplete");
    }
  }

  function createPatientImportAudit(batch, auditInput, action, metadata = {}) {
    return createAuditLog({
      ...auditInput,
      action,
      organizationId: auditInput.organizationId || batch.organizationId || "",
      resourceType: "patient_import_batch",
      resourceId: batch.id,
      metadata: {
        fileName: batch.fileName,
        rowCount: Number(batch.rowCount || 0),
        invalidCount: Number(batch.invalidCount || 0),
        duplicateCount: Number(batch.duplicateCount || 0),
        ...metadata,
      },
    });
  }

  async function insertPatientImportBatchSql(client, batch) {
    await client.query(
      `
        INSERT INTO patient_import_batches (
          id, organization_id, actor_user_id, file_name, file_size_bytes, file_sha256,
          status, row_count, valid_count, invalid_count, duplicate_count, rows_json,
          patient_ids, imported_count, version, expires_at, committed_at, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
          $13::jsonb, $14, $15, $16::timestamptz, $17::timestamptz,
          COALESCE($18::timestamptz, now()), COALESCE($19::timestamptz, now())
        )
      `,
      [
        batch.id,
        optional(batch.organizationId),
        optional(batch.actorUserId),
        batch.fileName || "patients.csv",
        Number(batch.fileSizeBytes || 0),
        batch.fileSha256 || "",
        batch.status || "invalid",
        Number(batch.rowCount || 0),
        Number(batch.validCount || 0),
        Number(batch.invalidCount || 0),
        Number(batch.duplicateCount || 0),
        JSON.stringify(batch.rows || []),
        JSON.stringify(batch.patientIds || []),
        Number(batch.importedCount || 0),
        Number(batch.version || 1),
        batch.expiresAt,
        optionalTimestamp(batch.committedAt),
        optionalTimestamp(batch.createdAt),
        optionalTimestamp(batch.updatedAt),
      ],
    );
  }

  const patientImports = {
    async findById(id) {
      const batchId = String(id || "");
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM patient_import_batches WHERE id = $1 LIMIT 1",
            [batchId],
          );
          if (!result.rows[0]) {
            getDb().patientImportBatches = runtimePatientImportBatches().filter(
              (batch) => batch.id !== batchId,
            );
            return null;
          }
          return syncArrayItem(runtimePatientImportBatches(), rowToPatientImportBatch(result.rows[0]));
        } catch (error) {
          onSqlError(error);
          throw repositoryError(503, "PATIENT_IMPORT_STORAGE_UNAVAILABLE", "Patient import storage is unavailable");
        }
      }
      return runtimePatientImportBatches().find((batch) => batch.id === batchId) || null;
    },

    async createWithAudit(batch, auditInput = {}, idempotencyInput = null, responseStatus = 201) {
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      if (!idempotency) {
        throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
      }
      const authorizationProbe = { id: `import_auth_${batch.id}`, organizationId: batch.organizationId };
      if (!getPool()) {
        return runPatientMutationExclusive(async () => {
          const runtimeDb = getDb();
          const snapshot = snapshotRuntimeDb(runtimeDb);
          try {
            assertRuntimePatientMutationAuthorization(auditInput.authorization, authorizationProbe);
            const replay = findRuntimeIdempotency(idempotency);
            if (replay) {
              assertIdempotencyFingerprint(replay, idempotency);
              const current = (runtimeDb.patientImportBatches || []).find(
                (candidate) => candidate.id === replay.resourceId,
              ) || null;
              if (!current) {
                throw repositoryError(409, "PATIENT_IMPORT_REPLAY_MISSING", "Patient import replay batch is missing");
              }
              replay.lastSeenAt = nowIso();
              return { batch: current, replayed: true, responseStatus: Number(replay.responseStatus || responseStatus) };
            }
            runtimeDb.patientImportBatches = Array.isArray(runtimeDb.patientImportBatches)
              ? runtimeDb.patientImportBatches
              : [];
            runtimeDb.patientImportBatches.unshift(batch);
            runtimeDb.patientImportBatches = runtimeDb.patientImportBatches.slice(0, 250);
            const auditLog = createPatientImportAudit(batch, auditInput, "patient.import.validate");
            syncRuntimeAuditLog(auditLog);
            syncRuntimeMutationIdempotency(
              idempotency,
              "patient_import_batch",
              batch.id,
              responseStatus,
              { batchId: batch.id },
            );
            await saveDb();
            return { batch, auditLog, replayed: false, responseStatus };
          } catch (error) {
            restoreRuntimeDb(runtimeDb, snapshot);
            throw error;
          }
        });
      }

      const result = await withSqlTransaction(async (client) => {
        await assertSqlPatientMutationAuthorization(client, auditInput.authorization, authorizationProbe);
        const replay = await findSqlMutationReplay(client, idempotency);
        if (replay) {
          if (replay.resource_type !== "patient_import_batch") {
            throw repositoryError(409, "PATIENT_IMPORT_REPLAY_MISMATCH", "Patient import replay type does not match");
          }
          const current = await client.query(
            "SELECT * FROM patient_import_batches WHERE id = $1 LIMIT 1",
            [replay.resource_id],
          );
          if (!current.rows[0]) {
            throw repositoryError(409, "PATIENT_IMPORT_REPLAY_MISSING", "Patient import replay batch is missing");
          }
          return {
            batch: rowToPatientImportBatch(current.rows[0]),
            auditLog: null,
            replayed: true,
            responseStatus: Number(replay.response_status || responseStatus),
          };
        }
        await insertPatientImportBatchSql(client, batch);
        const auditLog = createPatientImportAudit(batch, auditInput, "patient.import.validate");
        await queryInsertAuditLog(client, auditLog);
        await insertSqlMutationIdempotency(
          client,
          idempotency,
          "patient_import_batch",
          batch.id,
          responseStatus,
          { batchId: batch.id },
        );
        return { batch, auditLog, replayed: false, responseStatus };
      });
      syncArrayItem(runtimePatientImportBatches(), result.batch);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(
        idempotency,
        "patient_import_batch",
        result.batch.id,
        result.responseStatus,
        { batchId: result.batch.id },
      );
      await saveDb();
      return result;
    },

    async commitWithAudit(batchId, auditInput = {}, idempotencyInput = null, responseStatus = 201) {
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      if (!idempotency) {
        throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
      }
      const buildResponse = (batch, replayed) => ({
        batch,
        importedCount: Number(batch.importedCount || 0),
        patientIds: [...(batch.patientIds || [])],
        replayed,
        responseStatus,
      });

      if (!getPool()) {
        return runPatientMutationExclusive(async () => {
          const runtimeDb = getDb();
          const snapshot = snapshotRuntimeDb(runtimeDb);
          try {
            const replay = findRuntimeIdempotency(idempotency);
            if (replay) {
              assertIdempotencyFingerprint(replay, idempotency);
              if (replay.resourceType !== "patient_import_commit" || replay.resourceId !== batchId) {
                throw repositoryError(409, "PATIENT_IMPORT_REPLAY_MISMATCH", "Patient import commit replay does not match");
              }
              const current = (runtimeDb.patientImportBatches || []).find((batch) => batch.id === batchId) || null;
              if (!current) throw repositoryError(409, "PATIENT_IMPORT_REPLAY_MISSING", "Committed import batch is missing");
              replay.lastSeenAt = nowIso();
              return buildResponse(current, true);
            }
            const batch = (runtimeDb.patientImportBatches || []).find((candidate) => candidate.id === batchId) || null;
            assertPatientImportBatchReady(batch);
            const probe = batch.rows[0]?.patient || { id: `import_auth_${batch.id}`, organizationId: batch.organizationId };
            assertRuntimePatientMutationAuthorization(auditInput.authorization, probe);
            const conflicts = findPatientImportConflicts(batch.rows, runtimeDb.patients || []);
            if (conflicts.length > 0) {
              throw repositoryError(
                409,
                "PATIENT_IMPORT_DUPLICATES_CHANGED",
                "Patient data changed after validation; validate the CSV again",
                { conflicts: conflicts.slice(0, 100) },
              );
            }
            const patientsToCreate = batch.rows.map((row) => row.patient);
            for (const patient of patientsToCreate) {
              assertRuntimePatientMutationAuthorization(auditInput.authorization, patient);
              syncArrayItem(runtimeDb.patients, patient);
            }
            batch.status = "committed";
            batch.committedAt = nowIso();
            batch.updatedAt = batch.committedAt;
            batch.version = Number(batch.version || 1) + 1;
            batch.patientIds = patientsToCreate.map((patient) => patient.id);
            batch.importedCount = batch.patientIds.length;
            const auditLog = createPatientImportAudit(batch, auditInput, "patient.import.commit", {
              importedCount: batch.importedCount,
              patientIds: batch.patientIds,
            });
            syncRuntimeAuditLog(auditLog);
            const response = buildResponse(batch, false);
            syncRuntimeMutationIdempotency(
              idempotency,
              "patient_import_commit",
              batch.id,
              responseStatus,
              { batchId: batch.id, importedCount: response.importedCount, patientIds: response.patientIds },
            );
            await saveDb();
            return { ...response, auditLog };
          } catch (error) {
            restoreRuntimeDb(runtimeDb, snapshot);
            throw error;
          }
        });
      }

      const result = await withSqlTransaction(async (client) => {
        const replay = await findSqlMutationReplay(client, idempotency);
        if (replay) {
          if (replay.resource_type !== "patient_import_commit" || replay.resource_id !== batchId) {
            throw repositoryError(409, "PATIENT_IMPORT_REPLAY_MISMATCH", "Patient import commit replay does not match");
          }
          const current = await client.query(
            "SELECT * FROM patient_import_batches WHERE id = $1 LIMIT 1",
            [batchId],
          );
          if (!current.rows[0]) throw repositoryError(409, "PATIENT_IMPORT_REPLAY_MISSING", "Committed import batch is missing");
          return { ...buildResponse(rowToPatientImportBatch(current.rows[0]), true), auditLog: null };
        }
        const selected = await client.query(
          "SELECT * FROM patient_import_batches WHERE id = $1 LIMIT 1 FOR UPDATE",
          [batchId],
        );
        const batch = selected.rows[0] ? rowToPatientImportBatch(selected.rows[0]) : null;
        assertPatientImportBatchReady(batch);
        const probe = batch.rows[0]?.patient || { id: `import_auth_${batch.id}`, organizationId: batch.organizationId };
        await assertSqlPatientMutationAuthorization(client, auditInput.authorization, probe);
        await client.query("LOCK TABLE patients IN SHARE ROW EXCLUSIVE MODE");
        const existing = await client.query(
          "SELECT * FROM patients WHERE organization_id = $1 AND deleted_at IS NULL",
          [batch.organizationId],
        );
        const conflicts = findPatientImportConflicts(batch.rows, existing.rows.map(rowToPatient));
        if (conflicts.length > 0) {
          throw repositoryError(
            409,
            "PATIENT_IMPORT_DUPLICATES_CHANGED",
            "Patient data changed after validation; validate the CSV again",
            { conflicts: conflicts.slice(0, 100) },
          );
        }
        const patientsToCreate = batch.rows.map((row) => row.patient);
        for (const patient of patientsToCreate) {
          await assertSqlPatientMutationAuthorization(client, auditInput.authorization, patient);
          await queryUpsertPatient(client, patient);
        }
        batch.status = "committed";
        batch.committedAt = nowIso();
        batch.updatedAt = batch.committedAt;
        batch.version = Number(batch.version || 1) + 1;
        batch.patientIds = patientsToCreate.map((patient) => patient.id);
        batch.importedCount = batch.patientIds.length;
        await client.query(
          `
            UPDATE patient_import_batches
            SET status = 'committed', patient_ids = $2::jsonb, imported_count = $3,
                committed_at = $4::timestamptz, updated_at = $4::timestamptz, version = $5
            WHERE id = $1
          `,
          [batch.id, JSON.stringify(batch.patientIds), batch.importedCount, batch.committedAt, batch.version],
        );
        const auditLog = createPatientImportAudit(batch, auditInput, "patient.import.commit", {
          importedCount: batch.importedCount,
          patientIds: batch.patientIds,
        });
        await queryInsertAuditLog(client, auditLog);
        await insertSqlMutationIdempotency(
          client,
          idempotency,
          "patient_import_commit",
          batch.id,
          responseStatus,
          { batchId: batch.id, importedCount: batch.importedCount, patientIds: batch.patientIds },
        );
        return { ...buildResponse(batch, false), auditLog };
      });
      for (const row of result.batch.rows || []) syncArrayItem(getDb().patients, row.patient);
      syncArrayItem(runtimePatientImportBatches(), result.batch);
      if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
      syncRuntimeMutationIdempotency(
        idempotency,
        "patient_import_commit",
        result.batch.id,
        result.responseStatus,
        { batchId: result.batch.id, importedCount: result.importedCount, patientIds: result.patientIds },
      );
      await saveDb();
      return result;
    },
  };

  function findRuntimeAppointmentConflict(candidate) {
    if (!["scheduled", "confirmed"].includes(candidate.status)) return null;
    const startsAt = Date.parse(candidate.startsAt || "");
    const endsAt = Date.parse(candidate.endsAt || "");
    return (getDb().appointments || []).find((appointment) => {
      if (!appointment || appointment.id === candidate.id) return false;
      if (appointment.organizationId !== candidate.organizationId) return false;
      if (!["scheduled", "confirmed"].includes(appointment.status)) return false;
      const samePatient = Boolean(candidate.patientId && appointment.patientId === candidate.patientId);
      const sameDoctor = Boolean(candidate.doctorUserId && appointment.doctorUserId === candidate.doctorUserId);
      if (!samePatient && !sameDoctor) return false;
      return startsAt < Date.parse(appointment.endsAt || "") && endsAt > Date.parse(appointment.startsAt || "");
    }) || null;
  }

  function findRuntimeIdempotency(input = {}) {
    if (!input.key) return null;
    const entries = Array.isArray(getDb().idempotencyKeys) ? getDb().idempotencyKeys : [];
    return entries.find(
      (entry) => entry.scope === input.scope && entry.operation === input.operation && entry.key === input.key,
    ) || null;
  }

  function normalizeMutationIdempotency(input = {}) {
    if (!input || !input.key) return null;
    return {
      scope: String(input.scope || ""),
      operation: String(input.operation || ""),
      key: String(input.key || ""),
      fingerprint: String(input.fingerprint || ""),
    };
  }

  function syncRuntimeMutationIdempotency(idempotency, resourceType, resourceId, responseStatus, responseResource = {}) {
    if (!idempotency) return null;
    const db = getDb();
    db.idempotencyKeys = Array.isArray(db.idempotencyKeys) ? db.idempotencyKeys : [];
    const existing = findRuntimeIdempotency(idempotency);
    assertIdempotencyFingerprint(existing, idempotency);
    const values = {
      resourceType,
      resourceId,
      fingerprint: idempotency.fingerprint,
      responseStatus,
      responseResource,
      updatedAt: nowIso(),
      lastSeenAt: nowIso(),
    };
    if (existing) {
      Object.assign(existing, values);
      return existing;
    }
    const entry = {
      id: createId("idem"),
      scope: idempotency.scope,
      operation: idempotency.operation,
      key: idempotency.key,
      ...values,
      createdAt: nowIso(),
    };
    db.idempotencyKeys.unshift(entry);
    db.idempotencyKeys = db.idempotencyKeys.slice(0, 1000);
    return entry;
  }

  async function findSqlMutationReplay(client, idempotency) {
    if (!idempotency) return null;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${idempotency.scope}:${idempotency.operation}:${idempotency.key}`,
    ]);
    const result = await client.query(
      `
        SELECT fingerprint, response_status, response_json, resource_type, resource_id
        FROM mutation_idempotency
        WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
        LIMIT 1
      `,
      [idempotency.scope, idempotency.operation, idempotency.key],
    );
    const existing = result.rows[0] || null;
    assertIdempotencyFingerprint(existing, idempotency);
    return existing;
  }

  async function insertSqlMutationIdempotency(client, idempotency, resourceType, resourceId, responseStatus, responseResource = {}) {
    if (!idempotency) return;
    await client.query(
      `
        INSERT INTO mutation_idempotency (
          id, scope, operation, idempotency_key, fingerprint,
          resource_type, resource_id, response_status, response_json, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
      `,
      [
        createId("idem"),
        idempotency.scope,
        idempotency.operation,
        idempotency.key,
        idempotency.fingerprint,
        resourceType,
        resourceId,
        responseStatus,
        JSON.stringify(responseResource),
      ],
    );
  }

  function assertIdempotencyFingerprint(entry, idempotency) {
    if (entry && entry.fingerprint && entry.fingerprint !== idempotency.fingerprint) {
      throw repositoryError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key was already used with a different request payload",
      );
    }
  }

  function syncRuntimeIdempotency(idempotency, appointment, responseStatus) {
    if (!idempotency || !idempotency.key) return null;
    const db = getDb();
    db.idempotencyKeys = Array.isArray(db.idempotencyKeys) ? db.idempotencyKeys : [];
    const existing = findRuntimeIdempotency(idempotency);
    assertIdempotencyFingerprint(existing, idempotency);
    // Preserve the mutation outcome, not just the resource id. Replays must
    // return the original response even if the appointment changes later.
    const responseResource = JSON.parse(JSON.stringify(appointment));
    if (existing) {
      Object.assign(existing, {
        resourceType: "appointment",
        resourceId: appointment.id,
        fingerprint: idempotency.fingerprint,
        responseStatus,
        responseResource,
        updatedAt: nowIso(),
        lastSeenAt: nowIso(),
      });
      return existing;
    }
    const entry = {
      id: createId("idem"),
      scope: idempotency.scope,
      operation: idempotency.operation,
      key: idempotency.key,
      fingerprint: idempotency.fingerprint,
      resourceType: "appointment",
      resourceId: appointment.id,
      responseStatus,
      responseResource,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastSeenAt: nowIso(),
    };
    db.idempotencyKeys.unshift(entry);
    db.idempotencyKeys = db.idempotencyKeys.slice(0, 500);
    return entry;
  }

  const appointments = {
    async list(filters = {}) {
      const db = getDb();
      db.appointments = Array.isArray(db.appointments) ? db.appointments : [];
      const sqlAppointments = await withSql(async (pool) => {
        const where = [];
        const values = [];
        const add = (field, value) => {
          if (value === undefined || value === null || value === "") return;
          values.push(value);
          where.push(`${field} = $${values.length}`);
        };
        add("patient_id", filters.patientId);
        add("doctor_user_id", filters.doctorUserId);
        add("organization_id", filters.organizationId);
        add("status", filters.status);
        const result = await pool.query(
          `
            SELECT * FROM appointments
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY starts_at ASC, created_at DESC
            LIMIT 500
          `,
          values
        );
        return result.rows.map(rowToAppointment);
      });
      if (sqlAppointments && sqlAppointments.length > 0) {
        db.appointments = mergeSqlListWithRuntime(db.appointments, sqlAppointments);
      }
      return db.appointments
        .filter((appointment) => !filters.patientId || appointment.patientId === filters.patientId)
        .filter((appointment) => !filters.doctorUserId || appointment.doctorUserId === filters.doctorUserId)
        .filter((appointment) => !filters.organizationId || appointment.organizationId === filters.organizationId)
        .filter((appointment) => !filters.status || appointment.status === filters.status);
    },

    async findById(id) {
      const appointmentId = String(id || "");
      const sqlAppointment = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM appointments WHERE id = $1 LIMIT 1", [appointmentId]);
        return result.rows[0] ? rowToAppointment(result.rows[0]) : null;
      });
      if (sqlAppointment) {
        const db = getDb();
        db.appointments = Array.isArray(db.appointments) ? db.appointments : [];
        return syncArrayItem(db.appointments, sqlAppointment);
      }
      const db = getDb();
      db.appointments = Array.isArray(db.appointments) ? db.appointments : [];
      return db.appointments.find((appointment) => appointment.id === appointmentId) || null;
    },

    async save(appointment) {
      const db = getDb();
      db.appointments = Array.isArray(db.appointments) ? db.appointments : [];
      appointment.updatedAt = appointment.updatedAt || nowIso();
      syncArrayItem(db.appointments, appointment);
      await upsertAppointmentSql(appointment);
      await saveDb();
      return appointment;
    },

    async saveWithAudit(appointment, auditInput = {}, idempotency = null, responseStatus = 200) {
      const auditLog = createAuditLog({
        ...auditInput,
        organizationId: auditInput.organizationId || appointment.organizationId || "",
        resourceType: "appointment",
        resourceId: appointment.id,
      });
      const runtimeIdempotency = idempotency && idempotency.key
        ? {
            scope: String(idempotency.scope || ""),
            operation: String(idempotency.operation || ""),
            key: String(idempotency.key || ""),
            fingerprint: String(idempotency.fingerprint || ""),
          }
        : null;

      if (!getPool()) {
        const runtimeDb = getDb();
        runtimeDb.appointments = Array.isArray(runtimeDb.appointments) ? runtimeDb.appointments : [];
        runtimeDb.idempotencyKeys = Array.isArray(runtimeDb.idempotencyKeys) ? runtimeDb.idempotencyKeys : [];
        const existing = runtimeIdempotency ? findRuntimeIdempotency(runtimeIdempotency) : null;
        if (existing) {
          assertIdempotencyFingerprint(existing, runtimeIdempotency);
          existing.lastSeenAt = nowIso();
          const currentAppointment = runtimeDb.appointments.find(
            (item) => item.id === existing.resourceId,
          ) || null;
          const replayedAppointment =
            existing.responseResource && typeof existing.responseResource === "object" && existing.responseResource.id
              ? { ...existing.responseResource }
              : currentAppointment;
          return {
            appointment: replayedAppointment,
            auditLog: null,
            replayed: true,
            responseStatus: Number(existing.responseStatus || responseStatus),
          };
        }
        const conflict = findRuntimeAppointmentConflict(appointment);
        if (conflict) {
          throw repositoryError(
            409,
            "APPOINTMENT_TIME_CONFLICT",
            "Appointment time conflicts with another active appointment",
            { conflictingAppointmentId: conflict.id },
          );
        }
        syncArrayItem(runtimeDb.appointments, appointment);
        syncRuntimeAuditLog(auditLog);
        syncRuntimeIdempotency(runtimeIdempotency, appointment, responseStatus);
        await saveDb();
        return { appointment, auditLog, replayed: false, responseStatus };
      }

      const transactionResult = await withSqlTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `appointment:${appointment.organizationId}`,
        ]);
        if (runtimeIdempotency) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `${runtimeIdempotency.scope}:${runtimeIdempotency.operation}:${runtimeIdempotency.key}`,
          ]);
        }

        if (runtimeIdempotency) {
          const existingResult = await client.query(
            `
              SELECT fingerprint, response_status, response_json, resource_id
              FROM mutation_idempotency
              WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
              LIMIT 1
            `,
            [runtimeIdempotency.scope, runtimeIdempotency.operation, runtimeIdempotency.key],
          );
          const existing = existingResult.rows[0];
          if (existing) {
            assertIdempotencyFingerprint(existing, runtimeIdempotency);
            await client.query(
              `
                UPDATE mutation_idempotency
                SET updated_at = now()
                WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
              `,
              [runtimeIdempotency.scope, runtimeIdempotency.operation, runtimeIdempotency.key],
            );
            const current = await client.query(
              "SELECT * FROM appointments WHERE id = $1 LIMIT 1",
              [existing.resource_id || appointment.id],
            );
            const responseSnapshot =
              existing.response_json && typeof existing.response_json === "object" && existing.response_json.id
                ? existing.response_json
                : null;
            return {
              appointment: responseSnapshot || (current.rows[0] ? rowToAppointment(current.rows[0]) : null),
              auditLog: null,
              replayed: true,
              responseStatus: Number(existing.response_status || responseStatus),
            };
          }
        }

        if (["scheduled", "confirmed"].includes(appointment.status)) {
          const conflictResult = await client.query(
            `
              SELECT id
              FROM appointments
              WHERE organization_id = $1
                AND id <> $2
                AND status IN ('scheduled', 'confirmed')
                AND starts_at < $3::timestamptz
                AND ends_at > $4::timestamptz
                AND (patient_id = $5 OR ($6::text IS NOT NULL AND doctor_user_id = $6))
              LIMIT 1
            `,
            [
              optional(appointment.organizationId),
              appointment.id,
              optionalTimestamp(appointment.endsAt),
              optionalTimestamp(appointment.startsAt),
              optional(appointment.patientId),
              optional(appointment.doctorUserId),
            ],
          );
          if (conflictResult.rows[0]) {
            throw repositoryError(
              409,
              "APPOINTMENT_TIME_CONFLICT",
              "Appointment time conflicts with another active appointment",
              { conflictingAppointmentId: conflictResult.rows[0].id },
            );
          }
        }

        await queryUpsertAppointment(client, appointment);
        await queryInsertAuditLog(client, auditLog);
        if (runtimeIdempotency) {
          await client.query(
            `
              INSERT INTO mutation_idempotency (
                id, scope, operation, idempotency_key, fingerprint,
                resource_type, resource_id, response_status, response_json, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, 'appointment', $6, $7, $8::jsonb, now(), now())
            `,
            [
              createId("idem"),
              runtimeIdempotency.scope,
              runtimeIdempotency.operation,
              runtimeIdempotency.key,
              runtimeIdempotency.fingerprint,
              appointment.id,
              responseStatus,
              JSON.stringify(appointment),
            ],
          );
        }
        return { appointment, auditLog, replayed: false, responseStatus };
      });

      if (transactionResult.appointment) syncArrayItem(getDb().appointments, transactionResult.appointment);
      if (transactionResult.auditLog) syncRuntimeAuditLog(transactionResult.auditLog);
      if (runtimeIdempotency && transactionResult.appointment) {
        syncRuntimeIdempotency(
          runtimeIdempotency,
          transactionResult.appointment,
          transactionResult.responseStatus,
        );
      }
      await saveDb();
      return transactionResult;
    },

    async delete(id) {
      const appointmentId = String(id || "");
      const db = getDb();
      db.appointments = Array.isArray(db.appointments) ? db.appointments : [];
      const appointment = db.appointments.find((item) => item.id === appointmentId) || null;
      db.appointments = db.appointments.filter((item) => item.id !== appointmentId);
      await withSql((pool) => pool.query("DELETE FROM appointments WHERE id = $1", [appointmentId]));
      await saveDb();
      return appointment;
    },
  };

  function replacePatientShareCache(predicate, canonicalShares) {
    const canonical = canonicalShares.filter(Boolean);
    const canonicalIds = new Set(canonical.map((share) => share.id));
    const preserved = patientShareItems().filter(
      (share) => !predicate(share) && !canonicalIds.has(share.id),
    );
    getDb().doctorPatientAccess = [...canonical, ...preserved].slice(0, 1000);
    return canonical;
  }

  function patientAccessStorageUnavailable(error) {
    onSqlError(error);
    return repositoryError(
      503,
      "PATIENT_ACCESS_STORAGE_UNAVAILABLE",
      "Patient access storage is unavailable",
    );
  }

  function isPatientShareActive(grant) {
    if (!grant || grant.revokedAt) return false;
    if (!grant.expiresAt) return true;
    const expiresAt = Date.parse(grant.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  async function normalizePatientShareGrant(input = {}) {
    const grant = {
      ...input,
      scanIds: Array.from(new Set(
        (Array.isArray(input.scanIds) ? input.scanIds : [])
          .map((value) => String(value || ""))
          .filter(Boolean),
      )).sort(),
    };
    const requestedDoctorIdentity = grant.doctorUserId || grant.doctorId || "";
    if (requestedDoctorIdentity) {
      const doctor = await users.findByIdOrFirebaseUid(requestedDoctorIdentity);
      const approvedDoctorMembership = doctor
        ? (getDb().memberships || []).find((membership) => {
            if (
              membership.userId !== doctor.id ||
              String(membership.role || "") !== "doctor" ||
              String(membership.status || "active") !== "active"
            ) {
              return false;
            }
            const workspace = (getDb().organizations || []).find(
              (organization) => organization.id === membership.organizationId,
            );
            return isActiveSharedWorkspace(workspace);
          })
        : null;
      if (
        !doctor ||
        doctor.role !== "doctor" ||
        String(doctor.accountStatus || "active") !== "active" ||
        String(doctor.roleRequestStatus || "") !== "approved" ||
        !approvedDoctorMembership
      ) {
        throw repositoryError(404, "SHARE_DOCTOR_NOT_FOUND", "The doctor receiving access was not found");
      }
      grant.doctorUserId = doctor.id;
      grant.doctorId = doctor.id;
    } else {
      grant.doctorUserId = "";
      grant.doctorId = "";
    }
    grant.organizationId = String(grant.organizationId || "");
    if (!grant.doctorUserId && !grant.organizationId) {
      throw repositoryError(400, "SHARE_PRINCIPAL_REQUIRED", "A doctor or workspace share target is required");
    }
    if (grant.doctorUserId && grant.organizationId) {
      throw repositoryError(
        400,
        "SHARE_PRINCIPAL_EXCLUSIVE",
        "Exactly one doctor or workspace share target is required",
      );
    }
    if (!getPool() && grant.organizationId) {
      const workspace = (getDb().organizations || []).find((item) => item.id === grant.organizationId);
      if (!isActiveSharedWorkspace(workspace)) {
        throw repositoryError(404, "SHARE_WORKSPACE_NOT_FOUND", "The workspace receiving access was not found");
      }
    }
    grant.accessLevel = grant.accessLevel || "read";
    grant.scope = grant.scope || (grant.scanIds.length ? "selected_scans" : "patient_profile");
    if (!["patient_profile", "selected_scans"].includes(grant.scope)) {
      throw repositoryError(400, "SHARE_SCOPE_INVALID", "Patient share scope is invalid");
    }
    if (grant.scope === "selected_scans" && grant.scanIds.length === 0) {
      throw repositoryError(400, "SHARE_SCAN_SCOPE_EMPTY", "Selected-scan access requires at least one scan");
    }
    grant.authorityType = String(grant.authorityType || "administrative_assignment");
    if (
      ![
        "patient_consent",
        "clinician_access_grant",
        "administrative_assignment",
      ].includes(grant.authorityType)
    ) {
      throw repositoryError(
        400,
        "SHARE_AUTHORITY_TYPE_INVALID",
        "Patient access authority type is invalid",
      );
    }
    grant.purpose = String(grant.purpose || "").slice(0, 2000);
    grant.createdAt = grant.createdAt || nowIso();
    if (grant.authorityType === "patient_consent") {
      if (!grant.grantedByUserId) {
        throw repositoryError(
          400,
          "SHARE_CONSENT_ACTOR_REQUIRED",
          "Patient consent requires an authenticated patient or guardian actor",
        );
      }
      grant.consentedAt = grant.consentedAt || grant.createdAt;
    } else {
      grant.consentedAt = "";
    }
    if (grant.expiresAt) {
      const expiresAt = Date.parse(grant.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw repositoryError(400, "SHARE_EXPIRY_INVALID", "Patient share expiry must be a future date-time");
      }
      grant.expiresAt = new Date(expiresAt).toISOString();
    } else {
      grant.expiresAt = "";
    }
    grant.updatedAt = grant.updatedAt || nowIso();
    return grant;
  }

  function patientShareNaturalKey(grant) {
    return JSON.stringify({
      patientId: grant.patientId || "",
      doctorUserId: grant.doctorUserId || "",
      organizationId: grant.organizationId || "",
      accessLevel: grant.accessLevel || "read",
      authorityType: grant.authorityType || "administrative_assignment",
      purpose: grant.purpose || "",
      scope: grant.scope || "patient_profile",
      scanIds: [...(grant.scanIds || [])].sort(),
      expiresAt: grant.expiresAt || "",
    });
  }

  function isEquivalentActivePatientShare(left, right) {
    return isPatientShareActive(left) && patientShareNaturalKey(left) === patientShareNaturalKey(right);
  }

  function patientShareFromIdempotency(entry, fallback = null) {
    const response = entry?.responseResource || entry?.response_json;
    if (response && typeof response === "object" && response.id) return { ...response };
    if (!entry?.resourceId && !entry?.resource_id) return fallback;
    const resourceId = entry.resourceId || entry.resource_id;
    return patientShareItems().find((grant) => grant.id === resourceId) || fallback;
  }

  async function assertCanonicalShareDoctor(queryable, grant) {
    if (!grant.doctorUserId) return;
    const result = await queryable.query(
      `
        SELECT doctor_account.id
        FROM users doctor_account
        JOIN memberships doctor_membership
          ON doctor_membership.user_id = doctor_account.id
         AND doctor_membership.role = 'doctor'
         AND COALESCE(doctor_membership.status, 'active') = 'active'
        JOIN organizations doctor_workspace
          ON doctor_workspace.id = doctor_membership.organization_id
        WHERE doctor_account.id = $1
          AND doctor_account.role = 'doctor'
          AND doctor_account.account_status = 'active'
          AND doctor_account.role_request_status = 'approved'
          AND COALESCE(doctor_workspace.status, 'active') = 'active'
          AND COALESCE(doctor_workspace.workspace_type, doctor_workspace.type, 'clinic') <> 'personal'
        LIMIT 1
        FOR KEY SHARE OF doctor_account, doctor_membership, doctor_workspace
      `,
      [grant.doctorUserId],
    );
    if (!result.rows[0] || result.rows[0].id !== grant.doctorUserId) {
      throw repositoryError(404, "SHARE_DOCTOR_NOT_FOUND", "The doctor receiving access was not found");
    }
    grant.doctorUserId = result.rows[0].id;
    grant.doctorId = result.rows[0].id;
  }

  async function assertCanonicalShareWorkspace(queryable, grant) {
    if (!grant.organizationId) return;
    const result = await queryable.query(
      `
        SELECT id
        FROM organizations
        WHERE id = $1
          AND COALESCE(status, 'active') = 'active'
          AND COALESCE(workspace_type, type, 'clinic') <> 'personal'
        LIMIT 1
        FOR KEY SHARE
      `,
      [grant.organizationId],
    );
    if (!result.rows[0] || result.rows[0].id !== grant.organizationId) {
      throw repositoryError(404, "SHARE_WORKSPACE_NOT_FOUND", "The workspace receiving access was not found");
    }
  }

  async function savePatientShareMutation(
    input,
    auditInput = null,
    idempotencyInput = null,
    responseStatus = 201,
  ) {
    const authorization = auditInput?.authorization;
    const inferredAuthorityType = authorization
      ? authorization.kind === "personal"
        ? "patient_consent"
        : input.doctorUserId || input.doctorId
          ? "clinician_access_grant"
          : "administrative_assignment"
      : "";
    const grant = await normalizePatientShareGrant({
      ...input,
      authorityType: input.authorityType || inferredAuthorityType || "administrative_assignment",
    });
    assertPatientShareAuthorityType(authorization, grant);
    const idempotency = normalizeMutationIdempotency(idempotencyInput);
    const auditLog = auditInput
      ? createAuditLog({
          ...auditInput,
          organizationId: auditInput.organizationId || grant.organizationId || "",
          resourceType: auditInput.resourceType || "patient",
          resourceId: auditInput.resourceId || grant.patientId,
        })
      : null;

    if (getPool()) {
      let transactionResult;
      try {
        transactionResult = await withSqlTransaction(async (client) => {
          await assertSqlPatientShareAuthorization(
            client,
            auditInput?.authorization,
            grant.patientId,
          );
          const replay = await findSqlMutationReplay(client, idempotency);
          if (replay) {
            const current = await client.query(
              "SELECT * FROM doctor_patient_access WHERE id = $1 LIMIT 1",
              [replay.resource_id || grant.id],
            );
            return {
              grant: current.rows[0]
                ? rowToPatientShare(current.rows[0])
                : patientShareFromIdempotency(replay, grant),
              auditLog: null,
              replayed: true,
              responseStatus: Number(replay.response_status || responseStatus),
            };
          }
          await assertCanonicalShareDoctor(client, grant);
          await assertCanonicalShareWorkspace(client, grant);
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `patient-share:${patientShareNaturalKey(grant)}`,
          ]);
          const duplicate = await client.query(
            `
              SELECT *
              FROM doctor_patient_access
              WHERE patient_id = $1
                AND doctor_user_id IS NOT DISTINCT FROM NULLIF($2, '')
                AND organization_id IS NOT DISTINCT FROM NULLIF($3, '')
                AND access_level = $4
                AND authority_type = $5
                AND purpose = $6
                AND scope = $7
                AND scan_ids = $8::jsonb
                AND expires_at IS NOT DISTINCT FROM NULLIF($9, '')::timestamptz
                AND revoked_at IS NULL
                AND (expires_at IS NULL OR expires_at > now())
              LIMIT 1
              FOR UPDATE
            `,
            [
              grant.patientId,
              grant.doctorUserId,
              grant.organizationId,
              grant.accessLevel,
              grant.authorityType,
              grant.purpose,
              grant.scope,
              JSON.stringify(grant.scanIds),
              grant.expiresAt || "",
            ],
          );
          if (duplicate.rows[0]) {
            const existingGrant = rowToPatientShare(duplicate.rows[0]);
            await insertSqlMutationIdempotency(
              client,
              idempotency,
              "patient_share",
              existingGrant.id,
              responseStatus,
              existingGrant,
            );
            return {
              grant: existingGrant,
              auditLog: null,
              replayed: true,
              responseStatus,
            };
          }
          const result = await queryUpsertPatientShare(client, grant);
          const persistedGrant = result.rows[0] ? rowToPatientShare(result.rows[0]) : grant;
          if (auditLog) await queryInsertAuditLog(client, auditLog);
          await insertSqlMutationIdempotency(
            client,
            idempotency,
            "patient_share",
            persistedGrant.id,
            responseStatus,
            persistedGrant,
          );
          return { grant: persistedGrant, auditLog, replayed: false, responseStatus };
        });
      } catch (error) {
        if (error?.statusCode) throw error;
        throw patientAccessStorageUnavailable(error);
      }
      syncArrayItem(patientShareItems(), transactionResult.grant);
      if (transactionResult.auditLog) syncRuntimeAuditLog(transactionResult.auditLog);
      syncRuntimeMutationIdempotency(
        idempotency,
        "patient_share",
        transactionResult.grant.id,
        transactionResult.responseStatus,
        transactionResult.grant,
      );
      getDb().doctorPatientAccess = patientShareItems().slice(0, 1000);
      await saveDb();
      return transactionResult;
    }

    return runPatientShareMutationExclusive(grant.patientId, async () => {
      const runtimeDb = getDb();
      const snapshot = snapshotRuntimeDb(runtimeDb);
      try {
        assertRuntimePatientShareAuthorization(auditInput?.authorization, grant.patientId);
        const replay = idempotency ? findRuntimeIdempotency(idempotency) : null;
        if (replay) {
          assertIdempotencyFingerprint(replay, idempotency);
          replay.lastSeenAt = nowIso();
          return {
            grant: patientShareFromIdempotency(replay, grant),
            auditLog: null,
            replayed: true,
            responseStatus: Number(replay.responseStatus || responseStatus),
          };
        }
        const duplicate = patientShareItems().find((item) => isEquivalentActivePatientShare(item, grant));
        if (duplicate) {
          syncRuntimeMutationIdempotency(
            idempotency,
            "patient_share",
            duplicate.id,
            responseStatus,
            duplicate,
          );
          if (idempotency) await saveDb();
          return { grant: duplicate, auditLog: null, replayed: true, responseStatus };
        }
        syncArrayItem(patientShareItems(), grant);
        if (auditLog) syncRuntimeAuditLog(auditLog);
        syncRuntimeMutationIdempotency(
          idempotency,
          "patient_share",
          grant.id,
          responseStatus,
          grant,
        );
        runtimeDb.doctorPatientAccess = patientShareItems().slice(0, 1000);
        await saveDb();
        return { grant, auditLog, replayed: false, responseStatus };
      } catch (error) {
        restoreRuntimeDb(runtimeDb, snapshot);
        if (error?.statusCode) throw error;
        throw repositoryError(503, "PATIENT_ACCESS_STORAGE_UNAVAILABLE", "Patient access storage is unavailable");
      }
    });
  }

  async function revokePatientShareMutation(
    patientId,
    shareId,
    actorUserId = "",
    auditInput = null,
    idempotencyInput = null,
    responseStatus = 200,
  ) {
    const id = String(patientId || "");
    const grantId = String(shareId || "");
    const idempotency = normalizeMutationIdempotency(idempotencyInput);
    if (!id || !grantId) return { grant: null, auditLog: null, replayed: false, responseStatus };

    if (getPool()) {
      let transactionResult;
      try {
        transactionResult = await withSqlTransaction(async (client) => {
          await assertSqlPatientShareAuthorization(
            client,
            auditInput?.authorization,
            id,
          );
          const replay = await findSqlMutationReplay(client, idempotency);
          if (replay) {
            const current = await client.query(
              "SELECT * FROM doctor_patient_access WHERE id = $1 AND patient_id = $2 LIMIT 1",
              [replay.resource_id || grantId, id],
            );
            return {
              grant: current.rows[0]
                ? rowToPatientShare(current.rows[0])
                : patientShareFromIdempotency(replay),
              auditLog: null,
              replayed: true,
              responseStatus: Number(replay.response_status || responseStatus),
            };
          }
          const result = await client.query(
            "SELECT * FROM doctor_patient_access WHERE id = $1 AND patient_id = $2 LIMIT 1 FOR UPDATE",
            [grantId, id],
          );
          if (!result.rows[0]) {
            return { grant: null, auditLog: null, replayed: false, responseStatus };
          }
          const currentGrant = rowToPatientShare(result.rows[0]);
          if (currentGrant.revokedAt) {
            await insertSqlMutationIdempotency(
              client,
              idempotency,
              "patient_share",
              currentGrant.id,
              responseStatus,
              currentGrant,
            );
            return { grant: currentGrant, auditLog: null, replayed: true, responseStatus };
          }
          const revokedGrant = {
            ...currentGrant,
            revokedAt: nowIso(),
            revokedByUserId: actorUserId || currentGrant.revokedByUserId || "",
            updatedAt: nowIso(),
          };
          const auditLog = auditInput
            ? createAuditLog({
                ...auditInput,
                organizationId: auditInput.organizationId || revokedGrant.organizationId || "",
                resourceType: auditInput.resourceType || "patient_share",
                resourceId: auditInput.resourceId || revokedGrant.id,
              })
            : null;
          const upsertResult = await queryUpsertPatientShare(client, revokedGrant);
          const persistedGrant = upsertResult.rows[0]
            ? rowToPatientShare(upsertResult.rows[0])
            : revokedGrant;
          if (auditLog) await queryInsertAuditLog(client, auditLog);
          await insertSqlMutationIdempotency(
            client,
            idempotency,
            "patient_share",
            persistedGrant.id,
            responseStatus,
            persistedGrant,
          );
          return { grant: persistedGrant, auditLog, replayed: false, responseStatus };
        });
      } catch (error) {
        if (error?.statusCode) throw error;
        throw patientAccessStorageUnavailable(error);
      }
      if (transactionResult.grant) syncArrayItem(patientShareItems(), transactionResult.grant);
      if (transactionResult.auditLog) syncRuntimeAuditLog(transactionResult.auditLog);
      if (transactionResult.grant) {
        syncRuntimeMutationIdempotency(
          idempotency,
          "patient_share",
          transactionResult.grant.id,
          transactionResult.responseStatus,
          transactionResult.grant,
        );
      }
      await saveDb();
      return transactionResult;
    }

    return runPatientShareMutationExclusive(id, async () => {
      const runtimeDb = getDb();
      const snapshot = snapshotRuntimeDb(runtimeDb);
      assertRuntimePatientShareAuthorization(auditInput?.authorization, id);
      const currentGrant = patientShareItems().find(
        (grant) => grant.id === grantId && grant.patientId === id,
      ) || null;
      const replay = idempotency ? findRuntimeIdempotency(idempotency) : null;
      if (replay) {
        assertIdempotencyFingerprint(replay, idempotency);
        replay.lastSeenAt = nowIso();
        return {
          grant: patientShareFromIdempotency(replay, currentGrant),
          auditLog: null,
          replayed: true,
          responseStatus: Number(replay.responseStatus || responseStatus),
        };
      }
      if (!currentGrant) return { grant: null, auditLog: null, replayed: false, responseStatus };
      if (currentGrant.revokedAt) {
        try {
          syncRuntimeMutationIdempotency(
            idempotency,
            "patient_share",
            currentGrant.id,
            responseStatus,
            currentGrant,
          );
          if (idempotency) await saveDb();
          return { grant: currentGrant, auditLog: null, replayed: true, responseStatus };
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          if (error?.statusCode) throw error;
          throw repositoryError(503, "PATIENT_ACCESS_STORAGE_UNAVAILABLE", "Patient access storage is unavailable");
        }
      }
      const revokedGrant = {
        ...currentGrant,
        revokedAt: currentGrant.revokedAt || nowIso(),
        revokedByUserId: actorUserId || currentGrant.revokedByUserId || "",
        updatedAt: nowIso(),
      };
      const auditLog = auditInput
        ? createAuditLog({
            ...auditInput,
            organizationId: auditInput.organizationId || revokedGrant.organizationId || "",
            resourceType: auditInput.resourceType || "patient_share",
            resourceId: auditInput.resourceId || revokedGrant.id,
          })
        : null;
      try {
        syncArrayItem(patientShareItems(), revokedGrant);
        if (auditLog) syncRuntimeAuditLog(auditLog);
        syncRuntimeMutationIdempotency(
          idempotency,
          "patient_share",
          revokedGrant.id,
          responseStatus,
          revokedGrant,
        );
        await saveDb();
        return { grant: revokedGrant, auditLog, replayed: false, responseStatus };
      } catch (error) {
        restoreRuntimeDb(runtimeDb, snapshot);
        if (error?.statusCode) throw error;
        throw repositoryError(503, "PATIENT_ACCESS_STORAGE_UNAVAILABLE", "Patient access storage is unavailable");
      }
    });
  }

  const patientShares = {
    async listForPatient(patientId, options = {}) {
      const id = String(patientId || "");
      if (!id) return [];
      const includeRevoked = Boolean(options.includeRevoked);
      if (getPool()) {
        try {
          const result = await getPool().query(
            `
              SELECT * FROM doctor_patient_access
              WHERE patient_id = $1
                AND ($2::boolean = true OR revoked_at IS NULL)
              ORDER BY created_at DESC
            `,
            [id, includeRevoked],
          );
          return replacePatientShareCache(
            (grant) => grant.patientId === id,
            result.rows.map(rowToPatientShare),
          );
        } catch (error) {
          throw patientAccessStorageUnavailable(error);
        }
      }
      return patientShareItems()
        .filter((grant) => grant.patientId === id && (includeRevoked || !grant.revokedAt))
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    },

    async findForPatient(patientId, shareId) {
      const id = String(patientId || "");
      const grantId = String(shareId || "");
      if (!id || !grantId) return null;
      if (getPool()) {
        try {
          const result = await getPool().query(
            "SELECT * FROM doctor_patient_access WHERE id = $1 AND patient_id = $2 LIMIT 1",
            [grantId, id],
          );
          const sqlShare = result.rows[0] ? rowToPatientShare(result.rows[0]) : null;
          if (!sqlShare) {
            replacePatientShareCache(
              (grant) => grant.id === grantId && grant.patientId === id,
              [],
            );
            return null;
          }
          syncArrayItem(patientShareItems(), sqlShare);
          return sqlShare;
        } catch (error) {
          throw patientAccessStorageUnavailable(error);
        }
      }
      return patientShareItems().find((grant) => grant.id === grantId && grant.patientId === id) || null;
    },

    async listActiveForPrincipal(userId, organizationIds = [], options = {}) {
      const id = String(userId || "");
      const workspaces = Array.from(new Set(
        (Array.isArray(organizationIds) ? organizationIds : [])
          .map((value) => String(value || ""))
          .filter(Boolean),
      ));
      const aliases = new Set([
        id,
        ...(Array.isArray(options.identityAliases) ? options.identityAliases : []),
      ].map((value) => String(value || "")).filter(Boolean));
      const workspaceSet = new Set(workspaces);
      const matchesPrincipal = (grant) =>
        aliases.has(grant.doctorUserId) ||
        aliases.has(grant.doctorId) ||
        workspaceSet.has(grant.organizationId);

      if (getPool()) {
        try {
          const result = await getPool().query(
            `
              SELECT access.*
              FROM doctor_patient_access access
              LEFT JOIN users doctor
                ON doctor.id = access.doctor_user_id
               AND doctor.role = 'doctor'
              WHERE access.revoked_at IS NULL
                AND (access.expires_at IS NULL OR access.expires_at > now())
                AND (
                  (
                    access.doctor_user_id = $1
                    AND access.doctor_id = access.doctor_user_id
                    AND doctor.id IS NOT NULL
                  )
                  OR access.organization_id = ANY($2::text[])
                )
              ORDER BY access.created_at DESC
            `,
            [id, workspaces],
          );
          return replacePatientShareCache(matchesPrincipal, result.rows.map(rowToPatientShare));
        } catch (error) {
          throw patientAccessStorageUnavailable(error);
        }
      }
      return patientShareItems().filter((grant) => matchesPrincipal(grant) && isPatientShareActive(grant));
    },

    async save(grant) {
      return (await savePatientShareMutation(grant)).grant;
    },

    async saveWithAudit(grant, auditInput = {}, idempotency = null, responseStatus = 201) {
      return savePatientShareMutation(grant, auditInput, idempotency, responseStatus);
    },

    async revoke(patientId, shareId, actorUserId = "") {
      return (await revokePatientShareMutation(patientId, shareId, actorUserId)).grant;
    },

    async revokeWithAudit(
      patientId,
      shareId,
      actorUserId = "",
      auditInput = {},
      idempotency = null,
      responseStatus = 200,
    ) {
      return revokePatientShareMutation(
        patientId,
        shareId,
        actorUserId,
        auditInput,
        idempotency,
        responseStatus,
      );
    },
  };

  function deviceOwnershipSnapshot(device = {}) {
    return {
      organizationId: String(device.organizationId || ""),
      ownershipState: inferDeviceOwnershipState(device),
      ownerUserId: String(device.ownerUserId || device.pairedUserId || ""),
      assignedPatientId: String(device.assignedPatientId || ""),
      revokedAt: String(device.revokedAt || ""),
    };
  }

  function mergeGenericDeviceUpdate(currentDevice, incomingDevice) {
    if (!currentDevice) return cloneRuntimeValue(incomingDevice);
    const merged = {
      ...cloneRuntimeValue(incomingDevice),
      organizationId: currentDevice.organizationId || "",
      pairedUserId: currentDevice.pairedUserId || null,
      ownershipState: inferDeviceOwnershipState(currentDevice),
      ownerUserId: currentDevice.ownerUserId || currentDevice.pairedUserId || null,
      assignedPatientId: currentDevice.assignedPatientId || null,
      revokedByUserId: currentDevice.revokedByUserId || null,
      revokedAt: currentDevice.revokedAt || null,
      secretHash: currentDevice.secretHash || "",
      credentialRotation: cloneRuntimeValue(currentDevice.credentialRotation || {}),
    };
    if (inferDeviceOwnershipState(currentDevice) === "revoked") {
      merged.connected = false;
      merged.status = "revoked";
    }
    return merged;
  }

  function assertExpectedCredentialRotation(device, expectedInput) {
    if (!expectedInput) return;
    const expected = objectOf(expectedInput);
    const current = sanitizeDeviceCredentialRotation(device?.credentialRotation);
    const mismatches = [];
    for (const field of ["id", "state", "updatedAt"]) {
      if (
        Object.prototype.hasOwnProperty.call(expected, field) &&
        String(expected[field] || "") !== String(current[field] || "")
      ) {
        mismatches.push(field);
      }
    }
    if (mismatches.length > 0) {
      throw repositoryError(
        409,
        "DEVICE_SECRET_ROTATION_STALE",
        "Device credential rotation changed before the mutation could be committed",
        {
          deviceId: device?.id || "",
          mismatches,
          expected,
          canonical: {
            id: current.id || "",
            state: current.state || "",
            updatedAt: current.updatedAt || "",
          },
        },
      );
    }
  }

  function mergeCredentialRotationUpdate(currentDevice, proposedDevice) {
    const nextDevice = cloneRuntimeValue(currentDevice);
    const currentRotation = sanitizeDeviceCredentialRotation(
      currentDevice.credentialRotation,
    );
    const proposedRotation = sanitizeDeviceCredentialRotation(
      proposedDevice.credentialRotation,
    );
    if (proposedRotation.state === "confirmed") {
      const candidateHash = currentRotation.nextSecretHash || "";
      const proposedHash = proposedDevice.secretHash || "";
      if (!candidateHash || proposedHash !== candidateHash) {
        throw repositoryError(
          409,
          "DEVICE_SECRET_ROTATION_CANDIDATE_MISMATCH",
          "The confirmed device credential does not match the active rotation candidate",
          {
            deviceId: currentDevice.id || proposedDevice.id || "",
            rotationId: currentRotation.id || proposedRotation.id || "",
          },
        );
      }
      nextDevice.secretHash = candidateHash;
    } else {
      nextDevice.secretHash = currentDevice.secretHash || "";
    }
    nextDevice.credentialRotation = proposedRotation;
    nextDevice.updatedAt = proposedDevice.updatedAt || nowIso();
    if (Object.prototype.hasOwnProperty.call(proposedDevice, "lastCommand")) {
      nextDevice.lastCommand = cloneRuntimeValue(proposedDevice.lastCommand);
    }
    return nextDevice;
  }

  function assertExpectedDeviceOwnership(device, expected = {}) {
    const canonical = deviceOwnershipSnapshot(device);
    const mismatches = [];
    for (const field of Object.keys(canonical)) {
      if (
        Object.prototype.hasOwnProperty.call(expected, field) &&
        String(expected[field] || "") !== canonical[field]
      ) {
        mismatches.push(field);
      }
    }
    if (mismatches.length > 0) {
      throw repositoryError(
        409,
        "DEVICE_OWNERSHIP_STALE",
        "Device ownership changed before the mutation could be committed",
        {
          deviceId: device.id,
          mismatches,
          expected,
          canonical,
        },
      );
    }
  }

  function applyDeviceOwnershipIntent(currentDevice, input = {}) {
    const operation = String(input.operation || "").trim().toLowerCase();
    const allowedOperations = new Set(["update", "assign", "unassign", "revoke", "transfer"]);
    if (!allowedOperations.has(operation)) {
      throw repositoryError(
        400,
        "DEVICE_OWNERSHIP_OPERATION_INVALID",
        "A supported device ownership operation is required",
      );
    }
    assertExpectedDeviceOwnership(currentDevice, objectOf(input.expected));
    const at = String(input.at || nowIso());
    let nextDevice = cloneRuntimeValue(currentDevice);

    const patch = objectOf(input.patch);
    if (Object.prototype.hasOwnProperty.call(patch, "name")) {
      const name = String(patch.name || "").trim().slice(0, 120);
      if (!name) {
        throw repositoryError(
          400,
          "DEVICE_NAME_REQUIRED",
          "A non-empty device name is required",
        );
      }
      nextDevice.name = name;
    }

    if (operation === "assign") {
      nextDevice = applyDeviceOwnershipTransition(nextDevice, "assigned", {
        assignedPatientId: String(input.assignedPatientId || ""),
        at,
      });
    } else if (operation === "unassign") {
      nextDevice = applyDeviceOwnershipTransition(nextDevice, "unassigned", { at });
    } else if (operation === "revoke") {
      nextDevice = applyDeviceOwnershipTransition(nextDevice, "revoked", {
        actorUserId: String(input.actorUserId || ""),
        at,
      });
    } else if (operation === "transfer") {
      nextDevice = applyDeviceOwnershipTransfer(nextDevice, {
        organizationId: String(input.organizationId || ""),
        ownerUserId: String(input.ownerUserId || ""),
        at,
      });
      nextDevice.connected = false;
      nextDevice.status = "available";
    }
    nextDevice.updatedAt = at;
    return nextDevice;
  }

  function assertDeviceOwnershipShape(device = {}) {
    const state = inferDeviceOwnershipState(device);
    const organizationId = String(device.organizationId || "");
    const ownerUserId = String(device.ownerUserId || device.pairedUserId || "");
    const pairedUserId = String(device.pairedUserId || "");
    const assignedPatientId = String(device.assignedPatientId || "");
    const revokedAt = String(device.revokedAt || "");
    if (!organizationId) {
      throw repositoryError(
        400,
        "DEVICE_OWNERSHIP_WORKSPACE_REQUIRED",
        "A canonical workspace is required for an ownership mutation",
      );
    }
    if (["claimed", "assigned", "unassigned"].includes(state) && !ownerUserId) {
      throw repositoryError(
        400,
        "DEVICE_OWNER_REQUIRED",
        "A canonical owner is required for this device ownership state",
      );
    }
    if (ownerUserId && pairedUserId !== ownerUserId) {
      throw repositoryError(
        409,
        "DEVICE_OWNER_ALIAS_MISMATCH",
        "The canonical owner and API v1 compatibility owner must match",
      );
    }
    if (state === "assigned" && !assignedPatientId) {
      throw repositoryError(
        400,
        "DEVICE_ASSIGNMENT_PATIENT_REQUIRED",
        "An assigned device requires a canonical patient",
      );
    }
    if (["provisioned", "claimed", "unassigned"].includes(state) && assignedPatientId) {
      throw repositoryError(
        409,
        "DEVICE_ASSIGNMENT_STATE_MISMATCH",
        "The assigned patient does not match the canonical ownership state",
      );
    }
    if (state === "provisioned" && ownerUserId) {
      throw repositoryError(
        409,
        "DEVICE_OWNER_STATE_MISMATCH",
        "A provisioned device cannot already have an owner",
      );
    }
    if (state === "revoked") {
      if (!revokedAt || device.connected) {
        throw repositoryError(
          409,
          "DEVICE_REVOKED_STATE_INVALID",
          "A revoked device requires revocation metadata and must be offline",
        );
      }
    } else if (revokedAt) {
      throw repositoryError(
        409,
        "DEVICE_REVOCATION_STATE_MISMATCH",
        "Revocation metadata requires the revoked ownership state",
      );
    }
    device.ownershipState = state;
    return device;
  }

  function runtimeUserCanOwnDevice(runtimeDb, userId, organizationId) {
    const user = (runtimeDb.users || []).find((candidate) => candidate.id === userId);
    if (!user) return false;
    const accountStatus = String(user.accountStatus || "active").toLowerCase();
    if (accountStatus !== "active") return false;
    const role = String(user.role || "").toLowerCase();
    if (["admin", "platform_admin"].includes(role)) return true;
    return (runtimeDb.memberships || []).some(
      (membership) =>
        membership.userId === userId &&
        membership.organizationId === organizationId &&
        !membership.revokedAt &&
        !["inactive", "suspended", "revoked"].includes(
          String(membership.status || "active").toLowerCase(),
        ),
    );
  }

  function assertRuntimeDeviceOwnershipTargets(runtimeDb, device, auditLogs) {
    const organizationId = String(device.organizationId || "");
    if (!(runtimeDb.organizations || []).some((item) => item.id === organizationId)) {
      throw repositoryError(
        404,
        "DEVICE_WORKSPACE_NOT_FOUND",
        "The target device workspace does not exist",
      );
    }
    const ownerUserId = String(device.ownerUserId || device.pairedUserId || "");
    if (ownerUserId && !runtimeUserCanOwnDevice(runtimeDb, ownerUserId, organizationId)) {
      throw repositoryError(
        403,
        "DEVICE_OWNER_WORKSPACE_MISMATCH",
        "The target owner is not active in the device workspace",
      );
    }
    const assignedPatientId = String(device.assignedPatientId || "");
    if (assignedPatientId) {
      const patient = (runtimeDb.patients || []).find(
        (candidate) => candidate.id === assignedPatientId,
      );
      if (
        !patient ||
        patient.deletedAt ||
        String(patient.organizationId || "") !== organizationId
      ) {
        throw repositoryError(
          403,
          "DEVICE_PATIENT_WORKSPACE_MISMATCH",
          "The assigned patient is not active in the device workspace",
        );
      }
    }
    for (const auditLog of auditLogs) {
      if (!(runtimeDb.users || []).some((candidate) => candidate.id === auditLog.actorUserId)) {
        throw repositoryError(
          403,
          "DEVICE_OWNERSHIP_ACTOR_NOT_FOUND",
          "The ownership mutation actor is not a canonical user",
        );
      }
    }
  }

  async function assertSqlDeviceOwnershipTargets(client, device, auditLogs) {
    const organizationId = String(device.organizationId || "");
    const organization = await client.query(
      "SELECT id FROM organizations WHERE id = $1 LIMIT 1",
      [organizationId],
    );
    if (!organization.rows[0]) {
      throw repositoryError(
        404,
        "DEVICE_WORKSPACE_NOT_FOUND",
        "The target device workspace does not exist",
      );
    }

    const ownerUserId = String(device.ownerUserId || device.pairedUserId || "");
    if (ownerUserId) {
      const owner = await client.query(
        `
          SELECT
            target.id,
            target.role,
            target.organization_id,
            target.account_status,
            EXISTS (
              SELECT 1
              FROM memberships membership
              WHERE membership.user_id = target.id
                AND membership.organization_id = $2
                AND LOWER(COALESCE(membership.status, 'active')) = 'active'
            ) AS has_active_membership
          FROM users target
          WHERE target.id = $1
          LIMIT 1
        `,
        [ownerUserId, organizationId],
      );
      const row = owner.rows[0];
      const role = String(row?.role || "").toLowerCase();
      const accountStatus = String(row?.account_status || "active").toLowerCase();
      const authorized =
        row &&
        accountStatus === "active" &&
        (
          ["admin", "platform_admin"].includes(role) ||
          row.has_active_membership === true
        );
      if (!authorized) {
        throw repositoryError(
          403,
          "DEVICE_OWNER_WORKSPACE_MISMATCH",
          "The target owner is not active in the device workspace",
        );
      }
    }

    const assignedPatientId = String(device.assignedPatientId || "");
    if (assignedPatientId) {
      const patient = await client.query(
        `
          SELECT id
          FROM patients
          WHERE id = $1
            AND organization_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [assignedPatientId, organizationId],
      );
      if (!patient.rows[0]) {
        throw repositoryError(
          403,
          "DEVICE_PATIENT_WORKSPACE_MISMATCH",
          "The assigned patient is not active in the device workspace",
        );
      }
    }

    const actorIds = [...new Set(auditLogs.map((log) => log.actorUserId))];
    for (const actorUserId of actorIds) {
      const actor = await client.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [
        actorUserId,
      ]);
      if (!actor.rows[0]) {
        throw repositoryError(
          403,
          "DEVICE_OWNERSHIP_ACTOR_NOT_FOUND",
          "The ownership mutation actor is not a canonical user",
        );
      }
    }
  }

  function createDeviceOwnershipAuditLogs(auditInputs, currentDevice, nextDevice) {
    const inputs = Array.isArray(auditInputs) ? auditInputs : [auditInputs];
    const allowedOrganizationIds = new Set(
      [currentDevice.organizationId, nextDevice.organizationId]
        .map((value) => String(value || ""))
        .filter(Boolean),
    );
    const logs = inputs.map((input) => {
      const action = String(input?.action || "");
      const actorUserId = String(input?.actorUserId || "");
      const organizationId = String(input?.organizationId || "");
      if (!action || !actorUserId || !organizationId) {
        throw repositoryError(
          400,
          "DEVICE_OWNERSHIP_AUDIT_REQUIRED",
          "Every ownership mutation requires an actor, workspace, and action",
        );
      }
      if (!allowedOrganizationIds.has(organizationId)) {
        throw repositoryError(
          403,
          "DEVICE_OWNERSHIP_AUDIT_WORKSPACE_MISMATCH",
          "The ownership audit workspace is outside the mutation boundary",
        );
      }
      return createAuditLog({
        ...input,
        id: createId("audit"),
        action,
        actorUserId,
        organizationId,
        resourceType: "device",
        resourceId: nextDevice.id,
      });
    });
    if (logs.length === 0) {
      throw repositoryError(
        400,
        "DEVICE_OWNERSHIP_AUDIT_REQUIRED",
        "An ownership mutation requires an audit record",
      );
    }
    if (
      currentDevice.organizationId &&
      nextDevice.organizationId &&
      currentDevice.organizationId !== nextDevice.organizationId
    ) {
      for (const organizationId of [
        currentDevice.organizationId,
        nextDevice.organizationId,
      ]) {
        if (!logs.some((log) => log.organizationId === organizationId)) {
          throw repositoryError(
            400,
            "DEVICE_TRANSFER_DUAL_AUDIT_REQUIRED",
            "A cross-workspace transfer requires source and target audit records",
          );
        }
      }
    }
    return logs;
  }

  const devices = {
    async list() {
      const sqlDevices = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM devices ORDER BY updated_at DESC, created_at DESC");
        await repairLegacyDeviceSecretRows(pool, result.rows);
        return result.rows.map(rowToDevice);
      });
      if (sqlDevices && sqlDevices.length > 0) {
        getDb().devices = mergeSqlListWithRuntime(getDb().devices, sqlDevices);
        return cloneRuntimeValue(getDb().devices);
      }
      return cloneRuntimeValue(getDb().devices);
    },

    async findById(id) {
      const deviceId = String(id || "");
      const hasCanonicalSql = Boolean(getPool());
      const sqlDevice = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM devices WHERE id = $1 LIMIT 1", [deviceId]);
        await repairLegacyDeviceSecretRows(pool, result.rows);
        return result.rows[0] ? rowToDevice(result.rows[0]) : null;
      });
      if (sqlDevice) {
        return cloneRuntimeValue(syncArrayItem(getDb().devices, sqlDevice));
      }
      if (hasCanonicalSql) return null;
      return cloneRuntimeValue(
        getDb().devices.find((device) => device.id === deviceId) || null,
      );
    },

    async save(device) {
      // Remove raw enrollment material from the caller-owned object before any
      // persistence or runtime cache can retain it.
      normalizeDeviceSecretMaterial(device);
      const incomingDevice = cloneRuntimeValue(device);
      incomingDevice.updatedAt = incomingDevice.updatedAt || nowIso();
      const sqlDevice = await upsertDeviceSql(incomingDevice);
      if (getPool()) {
        const canonicalDevice =
          sqlDevice ||
          mergeGenericDeviceUpdate(
            getDb().devices.find((item) => item.id === incomingDevice.id),
            incomingDevice,
          );
        syncArrayItem(getDb().devices, canonicalDevice);
        try {
          await saveDb();
        } catch (error) {
          onSqlError(
            new Error(
              `PostgreSQL device save committed but runtime mirror refresh failed: ${error.message}`,
            ),
          );
        }
        return cloneRuntimeValue(canonicalDevice);
      }
      return runDeviceProvisionMutationExclusive(async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          runtimeDb.devices = Array.isArray(runtimeDb.devices) ? runtimeDb.devices : [];
          const currentDevice = runtimeDb.devices.find(
            (item) => item.id === incomingDevice.id,
          );
          const canonicalDevice = mergeGenericDeviceUpdate(
            currentDevice,
            incomingDevice,
          );
          syncArrayItem(runtimeDb.devices, canonicalDevice);
          await saveDb();
          return cloneRuntimeValue(canonicalDevice);
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },

    async saveCredentialRotationWithAudit(
      device,
      auditInput = {},
      idempotencyInput = null,
      responseStatus = 202,
      command = null,
      expectedRotation = null,
    ) {
      normalizeDeviceSecretMaterial(device);
      device.credentialRotation = sanitizeDeviceCredentialRotation(device.credentialRotation);
      if (!device.credentialRotation.id) {
        throw repositoryError(
          400,
          "DEVICE_SECRET_ROTATION_INVALID",
          "A canonical device credential rotation state is required",
        );
      }
      device.updatedAt = device.updatedAt || nowIso();
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      const auditLog = createAuditLog({
        ...auditInput,
        organizationId: auditInput.organizationId || device.organizationId || "",
        resourceType: "device",
        resourceId: device.id,
      });
      const safeResponse = {
        deviceId: device.id,
        rotationId: device.credentialRotation.id,
      };
      const isInitiation = auditInput.action === "device.secret_rotation.initiated";

      const assertNoDifferentActiveRotation = (existingDevice) => {
        if (!isInitiation || !existingDevice) return;
        const existingRotation = sanitizeDeviceCredentialRotation(existingDevice.credentialRotation);
        if (
          existingRotation.id &&
          existingRotation.id !== device.credentialRotation.id &&
          ["initiated", "pending_device_ack", "confirming"].includes(existingRotation.state) &&
          Date.parse(existingRotation.expiresAt || "") > Date.now()
        ) {
          throw repositoryError(
            409,
            "DEVICE_SECRET_ROTATION_IN_PROGRESS",
            "Another device credential rotation is already active",
          );
        }
      };

      const syncRuntime = (result) => {
        const runtimeDb = getDb();
        runtimeDb.devices = Array.isArray(runtimeDb.devices) ? runtimeDb.devices : [];
        if (result.device) {
          Object.assign(device, cloneRuntimeValue(result.device));
        }
        if (!result.replayed) {
          syncArrayItem(runtimeDb.devices, result.device || device);
          if (command) {
            runtimeDb.deviceCommands = Array.isArray(runtimeDb.deviceCommands)
              ? runtimeDb.deviceCommands
              : [];
            syncArrayItem(runtimeDb.deviceCommands, command);
            runtimeDb.deviceCommands = runtimeDb.deviceCommands
              .sort((left, right) => String(right.issuedAt || "").localeCompare(String(left.issuedAt || "")))
              .slice(0, 1000);
          }
          if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
        } else if (result.device) {
          syncArrayItem(runtimeDb.devices, result.device);
        }
        if (idempotency) {
          syncRuntimeMutationIdempotency(
            idempotency,
            "device_secret_rotation",
            device.id,
            result.responseStatus || responseStatus,
            safeResponse,
          );
        }
      };

      if (getPool()) {
        const result = await withSqlTransaction(async (client) => {
          const replay = idempotency ? await findSqlMutationReplay(client, idempotency) : null;
          if (replay) {
            const currentResult = await client.query(
              "SELECT * FROM devices WHERE id = $1 LIMIT 1",
              [replay.resource_id || device.id],
            );
            return {
              device: currentResult.rows[0] ? rowToDevice(currentResult.rows[0]) : null,
              auditLog: null,
              replayed: true,
              responseStatus: Number(replay.response_status || responseStatus),
            };
          }
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `device-credential-rotation:${device.id}`,
          ]);
          const existingResult = await client.query(
            "SELECT * FROM devices WHERE id = $1 FOR UPDATE",
            [device.id],
          );
          const existingDevice = existingResult.rows[0] ? rowToDevice(existingResult.rows[0]) : null;
          if (!existingDevice) {
            throw repositoryError(404, "DEVICE_NOT_FOUND", "Device not found");
          }
          assertNoDifferentActiveRotation(existingDevice);
          assertExpectedCredentialRotation(existingDevice, expectedRotation);
          const persistedDevice = mergeCredentialRotationUpdate(existingDevice, device);
          const promotesSecret = persistedDevice.credentialRotation.state === "confirmed";
          const upsertResult = await queryUpsertDevice(client, persistedDevice, {
            writeSecretHash: promotesSecret,
            writeCredentialRotation: true,
          });
          const canonicalDevice = upsertResult.rows?.[0]
            ? rowToDevice(upsertResult.rows[0])
            : persistedDevice;
          if (command) await queryUpsertDeviceCommand(client, command);
          await queryInsertAuditLog(client, auditLog);
          if (idempotency) {
            await insertSqlMutationIdempotency(
              client,
              idempotency,
              "device_secret_rotation",
              device.id,
              responseStatus,
              safeResponse,
            );
          }
          return {
            device: canonicalDevice,
            auditLog,
            replayed: false,
            responseStatus,
          };
        });
        syncRuntime(result);
        await saveDb();
        return result;
      }

      return runDeviceProvisionMutationExclusive(async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          const replay = idempotency ? findRuntimeIdempotency(idempotency) : null;
          if (replay) {
            assertIdempotencyFingerprint(replay, idempotency);
            replay.lastSeenAt = nowIso();
            const currentDevice = runtimeDb.devices.find((item) => item.id === device.id) || null;
            await saveDb();
            return {
              device: currentDevice,
              auditLog: null,
              replayed: true,
              responseStatus: Number(replay.responseStatus || responseStatus),
            };
          }
          const existingDevice = runtimeDb.devices.find((item) => item.id === device.id) || null;
          if (!existingDevice) {
            throw repositoryError(404, "DEVICE_NOT_FOUND", "Device not found");
          }
          assertNoDifferentActiveRotation(existingDevice);
          assertExpectedCredentialRotation(existingDevice, expectedRotation);
          const persistedDevice = mergeCredentialRotationUpdate(existingDevice, device);
          const result = {
            device: persistedDevice,
            auditLog,
            replayed: false,
            responseStatus,
          };
          syncRuntime(result);
          await saveDb();
          return result;
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },

    async saveProvisionWithAudit(
      device,
      claim,
      auditInput = {},
      idempotencyInput = null,
      responseBody = {},
      responseStatus = 201,
    ) {
      normalizeDeviceSecretMaterial(device);
      device.updatedAt = device.updatedAt || nowIso();
      const idempotency = normalizeMutationIdempotency(idempotencyInput);
      if (!idempotency) {
        throw repositoryError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Idempotency-Key is required for device provisioning",
        );
      }
      const auditLog = createAuditLog({
        ...auditInput,
        organizationId: auditInput.organizationId || device.organizationId || "",
        resourceType: "device",
        resourceId: device.id,
      });
      // The raw claim code is intentionally excluded by the route. Persist only
      // a safe response snapshot; the route deterministically reconstructs the
      // one-time code for an authenticated idempotent replay.
      const safeResponseBody = JSON.parse(JSON.stringify(responseBody || {}));
      const syncRuntimeProvision = (result) => {
        const runtimeDb = getDb();
        runtimeDb.devices = Array.isArray(runtimeDb.devices) ? runtimeDb.devices : [];
        runtimeDb.deviceClaims = Array.isArray(runtimeDb.deviceClaims) ? runtimeDb.deviceClaims : [];
        if (!result.replayed) {
          for (const existingClaim of runtimeDb.deviceClaims) {
            if (
              existingClaim.id !== claim.id &&
              existingClaim.deviceId === claim.deviceId &&
              !existingClaim.claimedAt &&
              !existingClaim.revokedAt
            ) {
              existingClaim.revokedAt = claim.createdAt || nowIso();
              existingClaim.revokedByUserId = claim.createdByUserId || "";
              existingClaim.updatedAt = existingClaim.revokedAt;
            }
          }
          syncArrayItem(runtimeDb.devices, result.device || device);
          syncArrayItem(runtimeDb.deviceClaims, claim);
          syncRuntimeAuditLog(auditLog);
        }
        syncRuntimeMutationIdempotency(
          idempotency,
          "device_provision",
          result.resourceId || result.responseBody?.device?.id || device.id,
          result.responseStatus,
          result.responseBody,
        );
        runtimeDb.deviceClaims = runtimeDb.deviceClaims.slice(0, 500);
      };

      if (getPool()) {
        const transactionResult = await withSqlTransaction(async (client) => {
          const replay = await findSqlMutationReplay(client, idempotency);
          if (replay) {
            return {
              responseBody: replay.response_json || safeResponseBody,
              responseStatus: Number(replay.response_status || responseStatus),
              resourceId: replay.resource_id || "",
              replayed: true,
              auditLog: null,
            };
          }
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `device-provision:${device.id}`,
          ]);
          const upsertResult = await queryUpsertDevice(client, device, {
            writeOwnership: true,
            writeSecretHashIfMissing: true,
          });
          const canonicalDevice = upsertResult.rows?.[0]
            ? rowToDevice(upsertResult.rows[0])
            : cloneRuntimeValue(device);
          await revokeOpenDeviceClaims(client, {
            deviceId: device.id,
            actorUserId: claim.createdByUserId,
            at: claim.createdAt || device.updatedAt || nowIso(),
          });
          await queryInsertDeviceClaim(client, claim);
          await queryInsertAuditLog(client, auditLog);
          await insertSqlMutationIdempotency(
            client,
            idempotency,
            "device_provision",
            device.id,
            responseStatus,
            safeResponseBody,
          );
          return {
            device: canonicalDevice,
            responseBody: safeResponseBody,
            responseStatus,
            resourceId: device.id,
            replayed: false,
            auditLog,
          };
        });
        if (transactionResult.device) {
          Object.assign(device, cloneRuntimeValue(transactionResult.device));
        }
        syncRuntimeProvision(transactionResult);
        await saveDb();
        return transactionResult;
      }

      return runDeviceProvisionMutationExclusive(async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          const replay = findRuntimeIdempotency(idempotency);
          if (replay) {
            assertIdempotencyFingerprint(replay, idempotency);
            replay.lastSeenAt = nowIso();
            await saveDb();
            return {
              responseBody: replay.responseResource || safeResponseBody,
              responseStatus: Number(replay.responseStatus || responseStatus),
              resourceId: replay.resourceId || "",
              replayed: true,
              auditLog: null,
            };
          }
          const result = {
            device,
            responseBody: safeResponseBody,
            responseStatus,
            resourceId: device.id,
            replayed: false,
            auditLog,
          };
          syncRuntimeProvision(result);
          await saveDb();
          return result;
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },

    async savePairingWithAudit(
      device,
      auditInput = {},
      notificationInput = {},
      idempotency = null,
      responseBody = {},
      responseStatus = 200,
      claimInput = null,
    ) {
      normalizeDeviceSecretMaterial(device);
      device.updatedAt = device.updatedAt || nowIso();
      const auditLog = createAuditLog({
        ...auditInput,
        organizationId: auditInput.organizationId || device.organizationId || "",
        resourceType: "device",
        resourceId: device.id,
      });
      const notification = {
        id: notificationInput.id || createId("noti"),
        userId: notificationInput.userId || "",
        organizationId: notificationInput.organizationId || device.organizationId || "",
        type: notificationInput.type || "info",
        title: notificationInput.title || "",
        message: notificationInput.message || "",
        channel: notificationInput.channel || "in_app",
        deliveryStatus: notificationInput.deliveryStatus || "ready",
        pushStatus: notificationInput.pushStatus || "ready",
        pushSentAt: "",
        pushFailedAt: "",
        pushErrorMessage: "",
        pushAttempts: [],
        metadata: notificationInput.metadata && typeof notificationInput.metadata === "object"
          ? notificationInput.metadata
          : {},
        read: false,
        readAt: "",
        createdAt: notificationInput.createdAt || nowIso(),
        updatedAt: nowIso(),
      };
      const runtimeIdempotency = idempotency && idempotency.key
        ? {
            scope: String(idempotency.scope || ""),
            operation: String(idempotency.operation || ""),
            key: String(idempotency.key || ""),
            fingerprint: String(idempotency.fingerprint || ""),
          }
        : null;
      const claimMutation = claimInput && claimInput.claimCodeHash
        ? {
            deviceId: String(device.id || ""),
            organizationId: String(claimInput.organizationId || device.organizationId || ""),
            claimCodeHash: String(claimInput.claimCodeHash || ""),
            claimedByUserId: String(claimInput.claimedByUserId || device.ownerUserId || device.pairedUserId || ""),
            at: String(claimInput.at || device.updatedAt || nowIso()),
          }
        : null;

      const syncRuntimePairing = (result) => {
        const runtimeDb = getDb();
        runtimeDb.devices = Array.isArray(runtimeDb.devices) ? runtimeDb.devices : [];
        runtimeDb.notifications = Array.isArray(runtimeDb.notifications) ? runtimeDb.notifications : [];
        runtimeDb.idempotencyKeys = Array.isArray(runtimeDb.idempotencyKeys) ? runtimeDb.idempotencyKeys : [];
        runtimeDb.deviceClaims = Array.isArray(runtimeDb.deviceClaims) ? runtimeDb.deviceClaims : [];
        syncArrayItem(runtimeDb.devices, result.device);
        if (result.claim) syncArrayItem(runtimeDb.deviceClaims, result.claim);
        if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
        if (result.notification) {
          syncArrayItem(runtimeDb.notifications, result.notification);
          runtimeDb.notifications = runtimeDb.notifications.slice(0, 200);
        }
        if (runtimeIdempotency && !result.replayed) {
          runtimeDb.idempotencyKeys.unshift({
            id: createId("idem"),
            scope: runtimeIdempotency.scope,
            operation: runtimeIdempotency.operation,
            key: runtimeIdempotency.key,
            fingerprint: runtimeIdempotency.fingerprint,
            resourceType: "device_pairing",
            resourceId: device.id,
            responseStatus: result.responseStatus,
            responseResource: result.responseBody,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            lastSeenAt: nowIso(),
          });
          runtimeDb.idempotencyKeys = runtimeDb.idempotencyKeys.slice(0, 500);
        }
      };

      if (!getPool()) {
        return runDeviceProvisionMutationExclusive(async () => {
          const runtimeDb = getDb();
          const snapshot = snapshotRuntimeDb(runtimeDb);
          try {
            const existing = runtimeIdempotency ? findRuntimeIdempotency(runtimeIdempotency) : null;
            if (existing) {
              assertIdempotencyFingerprint(existing, runtimeIdempotency);
              existing.lastSeenAt = nowIso();
              await saveDb();
              return {
                device: runtimeDb.devices.find((item) => item.id === device.id) || device,
                responseBody: existing.responseResource || responseBody,
                auditLog: null,
                notification: null,
                claim: null,
                replayed: true,
                responseStatus: Number(existing.responseStatus || responseStatus),
              };
            }
            let claimedRecord = null;
            if (claimMutation) {
              const claim = runtimeDb.deviceClaims.find(
                (item) =>
                  item.deviceId === claimMutation.deviceId &&
                  item.claimCodeHash === claimMutation.claimCodeHash,
              );
              validateActiveDeviceClaim(claim, {
                deviceId: claimMutation.deviceId,
                organizationId: claimMutation.organizationId,
                claimCodeHash: claimMutation.claimCodeHash,
                now: Date.parse(claimMutation.at),
              });
              claimedRecord = {
                ...claim,
                claimedByUserId: claimMutation.claimedByUserId,
                claimedAt: claimMutation.at,
                updatedAt: claimMutation.at,
              };
            }
            const canonicalOwnership = applyDeviceOwnershipTransition(device, "claimed", {
              ownerUserId: claimMutation?.claimedByUserId || device.ownerUserId || device.pairedUserId,
              at: claimMutation?.at || device.updatedAt || nowIso(),
            });
            Object.assign(device, canonicalOwnership);
            const result = {
              device,
              responseBody,
              auditLog,
              notification,
              claim: claimedRecord,
              replayed: false,
              responseStatus,
            };
            syncRuntimePairing(result);
            await saveDb();
            return result;
          } catch (error) {
            restoreRuntimeDb(runtimeDb, snapshot);
            throw error;
          }
        });
      }

      const transactionResult = await withSqlTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `device-pair:${device.organizationId}:${device.id}`,
        ]);
        if (runtimeIdempotency) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `${runtimeIdempotency.scope}:${runtimeIdempotency.operation}:${runtimeIdempotency.key}`,
          ]);
          const existingResult = await client.query(
            `
              SELECT fingerprint, response_status, response_json
              FROM mutation_idempotency
              WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
              LIMIT 1
            `,
            [runtimeIdempotency.scope, runtimeIdempotency.operation, runtimeIdempotency.key],
          );
          const existing = existingResult.rows[0];
          if (existing) {
            assertIdempotencyFingerprint(existing, runtimeIdempotency);
            await client.query(
              `
                UPDATE mutation_idempotency
                SET updated_at = now()
                WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
              `,
              [runtimeIdempotency.scope, runtimeIdempotency.operation, runtimeIdempotency.key],
            );
            return {
              device,
              responseBody: existing.response_json || responseBody,
              auditLog: null,
              notification: null,
              replayed: true,
              responseStatus: Number(existing.response_status || responseStatus),
            };
          }
        }

        let claimedRecord = null;
        if (claimMutation) {
          const claim = await loadDeviceClaimForUpdate(client, claimMutation);
          validateActiveDeviceClaim(claim, {
            deviceId: claimMutation.deviceId,
            organizationId: claimMutation.organizationId,
            claimCodeHash: claimMutation.claimCodeHash,
            now: Date.parse(claimMutation.at),
          });
          claimedRecord = await claimDeviceClaim(client, {
            claimId: claim.id,
            claimedByUserId: claimMutation.claimedByUserId,
            organizationId: claimMutation.organizationId,
            at: claimMutation.at,
          });
        }
        const canonicalOwnership = applyDeviceOwnershipTransition(device, "claimed", {
          ownerUserId: claimMutation?.claimedByUserId || device.ownerUserId || device.pairedUserId,
          at: claimMutation?.at || device.updatedAt || nowIso(),
        });
        Object.assign(device, canonicalOwnership);
        const upsertResult = await queryUpsertDevice(client, device, {
          writeOwnership: true,
          writeSecretHashIfMissing: true,
        });
        const canonicalDevice = upsertResult.rows?.[0]
          ? rowToDevice(upsertResult.rows[0])
          : cloneRuntimeValue(device);
        await queryInsertAuditLog(client, auditLog);
        await queryUpsertNotification(client, notification);
        if (runtimeIdempotency) {
          await client.query(
            `
              INSERT INTO mutation_idempotency (
                id, scope, operation, idempotency_key, fingerprint,
                resource_type, resource_id, response_status, response_json, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, 'device_pairing', $6, $7, $8::jsonb, now(), now())
            `,
            [
              createId("idem"),
              runtimeIdempotency.scope,
              runtimeIdempotency.operation,
              runtimeIdempotency.key,
              runtimeIdempotency.fingerprint,
              device.id,
              responseStatus,
              JSON.stringify(responseBody),
            ],
          );
        }
        return {
          device: canonicalDevice,
          responseBody,
          auditLog,
          notification,
          claim: claimedRecord,
          replayed: false,
          responseStatus,
        };
      });

      if (transactionResult.device) {
        Object.assign(device, cloneRuntimeValue(transactionResult.device));
      }
      syncRuntimePairing(transactionResult);
      await saveDb();
      return transactionResult;
    },

    async saveOwnershipMutationWithAudit(intentInput = {}, auditInputs = []) {
      const deviceId = String(intentInput.deviceId || "").trim();
      const actorUserId = String(intentInput.actorUserId || "").trim();
      if (!deviceId) {
        throw repositoryError(
          400,
          "DEVICE_OWNERSHIP_DEVICE_REQUIRED",
          "A canonical device id is required for an ownership mutation",
        );
      }
      if (!actorUserId) {
        throw repositoryError(
          400,
          "DEVICE_OWNERSHIP_ACTOR_REQUIRED",
          "A canonical actor is required for an ownership mutation",
        );
      }
      const intent = {
        ...intentInput,
        deviceId,
        actorUserId,
        at: String(intentInput.at || nowIso()),
      };
      const revokeClaims = Boolean(intent.revokeOpenClaims);
      const claimOrganizationId = Object.prototype.hasOwnProperty.call(
        intent,
        "claimOrganizationId",
      )
        ? String(intent.claimOrganizationId || "")
        : intent.operation === "transfer"
          ? String(intent.expected?.organizationId || "")
          : "";

      const syncSqlResultToRuntime = async (result) => {
        try {
          const runtimeDb = getDb();
          runtimeDb.devices = Array.isArray(runtimeDb.devices) ? runtimeDb.devices : [];
          runtimeDb.deviceClaims = Array.isArray(runtimeDb.deviceClaims)
            ? runtimeDb.deviceClaims
            : [];
          syncArrayItem(runtimeDb.devices, result.device);
          const revokedIds = new Set(result.revokedClaimIds || []);
          for (const claim of runtimeDb.deviceClaims) {
            if (revokedIds.has(claim.id)) {
              claim.revokedAt = intent.at;
              claim.revokedByUserId = actorUserId;
              claim.updatedAt = intent.at;
            }
          }
          for (const auditLog of result.auditLogs || []) syncRuntimeAuditLog(auditLog);
          await saveDb();
        } catch (error) {
          onSqlError(
            new Error(
              `PostgreSQL ownership mutation committed but runtime mirror refresh failed: ${error.message}`,
            ),
          );
        }
      };

      if (getPool()) {
        const result = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `device-ownership:${deviceId}`,
          ]);
          const existing = await client.query(
            "SELECT * FROM devices WHERE id = $1 FOR UPDATE",
            [deviceId],
          );
          const currentDevice = existing.rows[0] ? rowToDevice(existing.rows[0]) : null;
          if (!currentDevice) {
            throw repositoryError(404, "DEVICE_NOT_FOUND", "Device not found");
          }
          const nextDevice = assertDeviceOwnershipShape(
            applyDeviceOwnershipIntent(currentDevice, intent),
          );
          normalizeDeviceSecretMaterial(nextDevice);
          const auditLogs = createDeviceOwnershipAuditLogs(
            auditInputs,
            currentDevice,
            nextDevice,
          );
          if (auditLogs.some((log) => log.actorUserId !== actorUserId)) {
            throw repositoryError(
              403,
              "DEVICE_OWNERSHIP_AUDIT_ACTOR_MISMATCH",
              "The audit actor must match the ownership mutation actor",
            );
          }
          await assertSqlDeviceOwnershipTargets(client, nextDevice, auditLogs);
          await queryUpsertDevice(client, nextDevice, { writeOwnership: true });
          const revokedClaimIds = revokeClaims
            ? await revokeOpenDeviceClaims(client, {
                deviceId,
                organizationId: claimOrganizationId,
                actorUserId,
                at: intent.at,
              })
            : [];
          for (const auditLog of auditLogs) {
            const inserted = await queryInsertAuditLog(client, auditLog);
            if (inserted.rowCount !== 1) {
              throw repositoryError(
                409,
                "DEVICE_OWNERSHIP_AUDIT_CONFLICT",
                "The ownership audit record could not be inserted exactly once",
              );
            }
          }
          return { device: nextDevice, auditLogs, revokedClaimIds };
        });
        await syncSqlResultToRuntime(result);
        return result;
      }

      return runDeviceProvisionMutationExclusive(async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          runtimeDb.devices = Array.isArray(runtimeDb.devices) ? runtimeDb.devices : [];
          runtimeDb.deviceClaims = Array.isArray(runtimeDb.deviceClaims)
            ? runtimeDb.deviceClaims
            : [];
          const currentDevice = runtimeDb.devices.find((item) => item.id === deviceId);
          if (!currentDevice) {
            throw repositoryError(404, "DEVICE_NOT_FOUND", "Device not found");
          }
          const nextDevice = assertDeviceOwnershipShape(
            applyDeviceOwnershipIntent(cloneRuntimeValue(currentDevice), intent),
          );
          normalizeDeviceSecretMaterial(nextDevice);
          const auditLogs = createDeviceOwnershipAuditLogs(
            auditInputs,
            currentDevice,
            nextDevice,
          );
          if (auditLogs.some((log) => log.actorUserId !== actorUserId)) {
            throw repositoryError(
              403,
              "DEVICE_OWNERSHIP_AUDIT_ACTOR_MISMATCH",
              "The audit actor must match the ownership mutation actor",
            );
          }
          assertRuntimeDeviceOwnershipTargets(runtimeDb, nextDevice, auditLogs);
          syncArrayItem(runtimeDb.devices, nextDevice);
          const revokedClaimIds = [];
          if (revokeClaims) {
            for (const claim of runtimeDb.deviceClaims) {
              if (
                claim.deviceId === deviceId &&
                !claim.claimedAt &&
                !claim.revokedAt &&
                (!claimOrganizationId || claim.organizationId === claimOrganizationId)
              ) {
                claim.revokedAt = intent.at;
                claim.revokedByUserId = actorUserId;
                claim.updatedAt = intent.at;
                revokedClaimIds.push(claim.id);
              }
            }
          }
          for (const auditLog of auditLogs) syncRuntimeAuditLog(auditLog);
          await saveDb();
          return { device: cloneRuntimeValue(nextDevice), auditLogs, revokedClaimIds };
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
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

  const scanPageSorts = Object.freeze({
    "createdAt:desc": {
      direction: "DESC",
      filtered: "COALESCE(scan.created_at, scan.started_at)",
      paged: "COALESCE(paged.created_at, paged.started_at)",
      runtimeField: "createdAt",
    },
    "createdAt:asc": {
      direction: "ASC",
      filtered: "COALESCE(scan.created_at, scan.started_at)",
      paged: "COALESCE(paged.created_at, paged.started_at)",
      runtimeField: "createdAt",
    },
    "status:asc": {
      direction: "ASC",
      filtered: "scan.status",
      paged: "paged.status",
      runtimeField: "status",
    },
    "status:desc": {
      direction: "DESC",
      filtered: "scan.status",
      paged: "paged.status",
      runtimeField: "status",
    },
  });

  function normalizeScanPage(filters = {}) {
    const page = Math.max(1, Math.min(100000, Number(filters.page) || 1));
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const sort = String(filters.sort || "createdAt:desc");
    const sortContract = scanPageSorts[sort];
    if (!sortContract) {
      throw repositoryError(400, "SCAN_SORT_INVALID", "Unsupported scan sort");
    }
    return {
      page,
      limit,
      sort,
      sortContract,
      offset: (page - 1) * limit,
      q: String(filters.q || "").trim().slice(0, 200),
    };
  }

  function scanRuntimeSearchText(scan, runtimeDb) {
    const patient = (runtimeDb.patients || []).find((item) => item.id === scan.patientId);
    return [
      scan.id,
      scan.patientId,
      scan.patientName,
      patient?.name,
      scan.deviceId,
      scan.mode,
      scan.bodySite,
      scan.status,
      scan.processingStatus,
      scan.aiLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
  }

  async function listScanPage(filters = {}) {
    const pageContract = normalizeScanPage(filters);
    const authorizedPatientIds = Array.isArray(filters.authorizedPatientIds)
      ? [...new Set(filters.authorizedPatientIds.map(String).filter(Boolean))]
      : null;
    const authorizedScanIds = Array.isArray(filters.authorizedScanIds)
      ? [...new Set(filters.authorizedScanIds.map(String).filter(Boolean))]
      : null;
    const hasExplicitAuthorization = authorizedPatientIds !== null || authorizedScanIds !== null;
    if (
      hasExplicitAuthorization &&
      (authorizedPatientIds || []).length === 0 &&
      (authorizedScanIds || []).length === 0
    ) {
      return { items: [], total: 0, page: pageContract.page, limit: pageContract.limit, sort: pageContract.sort };
    }

    const sqlPage = await withSql(async (pool) => {
      const where = [];
      const params = [];
      function add(field, value) {
        if (value === undefined || value === null || value === "") return;
        params.push(value);
        where.push(`${field} = $${params.length}`);
      }
      add("scan.organization_id", filters.organizationId);
      add("scan.patient_id", filters.patientId);
      add("scan.device_id", filters.deviceId);
      add("scan.status", filters.status);
      if (hasExplicitAuthorization) {
        const accessClauses = [];
        if ((authorizedPatientIds || []).length > 0) {
          params.push(authorizedPatientIds);
          accessClauses.push(`scan.patient_id = ANY($${params.length}::text[])`);
        }
        if ((authorizedScanIds || []).length > 0) {
          params.push(authorizedScanIds);
          accessClauses.push(`scan.id = ANY($${params.length}::text[])`);
        }
        where.push(`(${accessClauses.join(" OR ")})`);
      }
      if (filters.createdFrom) {
        params.push(filters.createdFrom);
        where.push(`scan.created_at >= $${params.length}::timestamptz`);
      }
      if (filters.createdTo) {
        params.push(filters.createdTo);
        where.push(`scan.created_at <= $${params.length}::timestamptz`);
      }
      if (pageContract.q) {
        params.push(pageContract.q.toLocaleLowerCase());
        where.push(
          `strpos(lower(concat_ws(' ', scan.id, scan.patient_id, patient.name, scan.device_id, scan.mode, scan.body_site, scan.status, scan.processing_status, scan.ai_label)), $${params.length}) > 0`,
        );
      }
      params.push(pageContract.limit);
      const limitParameter = params.length;
      params.push(pageContract.offset);
      const offsetParameter = params.length;
      const order = `${pageContract.sortContract.filtered} ${pageContract.sortContract.direction}, scan.id ASC`;
      const pagedOrder = `${pageContract.sortContract.paged} ${pageContract.sortContract.direction}, paged.id ASC`;
      const result = await pool.query(
        `WITH filtered AS (
           SELECT scan.*, patient.name AS patient_name
           FROM scan_sessions scan
           LEFT JOIN patients patient ON patient.id = scan.patient_id
           ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ), paged AS (
           SELECT * FROM filtered scan
           ORDER BY ${order}
           LIMIT $${limitParameter} OFFSET $${offsetParameter}
         )
         SELECT
           (SELECT count(*)::integer FROM filtered) AS total,
           COALESCE(
             jsonb_agg(to_jsonb(paged) ORDER BY ${pagedOrder}) FILTER (WHERE paged.id IS NOT NULL),
             '[]'::jsonb
           ) AS items
         FROM paged`,
        params,
      );
      const row = result.rows[0] || { total: 0, items: [] };
      const rawItems = typeof row.items === "string" ? JSON.parse(row.items || "[]") : row.items;
      return {
        items: (Array.isArray(rawItems) ? rawItems : []).map(rowToScan),
        total: Number(row.total || 0),
      };
    });
    if (sqlPage) {
      for (const scan of sqlPage.items) syncArrayItem(getDb().scans, scan);
      return { ...sqlPage, page: pageContract.page, limit: pageContract.limit, sort: pageContract.sort };
    }

    const runtimeDb = getDb();
    const patientAccess = new Set(authorizedPatientIds || []);
    const scanAccess = new Set(authorizedScanIds || []);
    const q = pageContract.q.toLocaleLowerCase();
    const timestamp = (scan) => String(scan.createdAt || scan.startedAt || "");
    let items = (runtimeDb.scans || [])
      .filter((scan) => !filters.organizationId || scan.organizationId === filters.organizationId)
      .filter((scan) => !filters.patientId || scan.patientId === filters.patientId)
      .filter((scan) => !filters.deviceId || scan.deviceId === filters.deviceId)
      .filter((scan) => !filters.status || scan.status === filters.status)
      .filter((scan) => !hasExplicitAuthorization || patientAccess.has(scan.patientId) || scanAccess.has(scan.id))
      .filter((scan) => !filters.createdFrom || timestamp(scan) >= String(filters.createdFrom))
      .filter((scan) => !filters.createdTo || timestamp(scan) <= String(filters.createdTo))
      .filter((scan) => !q || scanRuntimeSearchText(scan, runtimeDb).includes(q))
      .map((scan) => {
        const patient = (runtimeDb.patients || []).find((item) => item.id === scan.patientId);
        return { ...scan, patientName: scan.patientName || patient?.name || "" };
      });
    const direction = pageContract.sortContract.direction === "ASC" ? 1 : -1;
    items.sort((left, right) => {
      const leftValue = pageContract.sortContract.runtimeField === "createdAt" ? timestamp(left) : String(left.status || "");
      const rightValue = pageContract.sortContract.runtimeField === "createdAt" ? timestamp(right) : String(right.status || "");
      const primary = leftValue.localeCompare(rightValue);
      return primary !== 0 ? primary * direction : String(left.id || "").localeCompare(String(right.id || ""));
    });
    const total = items.length;
    items = items.slice(pageContract.offset, pageContract.offset + pageContract.limit).map(cloneRuntimeValue);
    return { items, total, page: pageContract.page, limit: pageContract.limit, sort: pageContract.sort };
  }

  const scans = {
    async list(filters = {}) {
      const page = await listScanPage({ ...filters, page: 1 });
      return page.items;
    },

    listPage: listScanPage,

    async findById(id) {
      const scanId = String(id || "");
      const hasCanonicalSql = Boolean(getPool());
      const sqlScan = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM scan_sessions WHERE id = $1 LIMIT 1", [scanId]);
        return result.rows[0] ? rowToScan(result.rows[0]) : null;
      });
      if (sqlScan) {
        return syncArrayItem(getDb().scans, sqlScan);
      }
      if (hasCanonicalSql) return null;
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
      getDb().scanAudioChunks = (getDb().scanAudioChunks || []).filter((item) => item.scanId !== scanId);
      getDb().scanAudioCompletions = (getDb().scanAudioCompletions || []).filter((item) => item.scanId !== scanId);
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

  const audioProcessing = {
    async save(input = {}) {
      const scan = cloneRuntimeValue(input.scan);
      const audioFile = cloneRuntimeValue(input.audioFile);
      const aiResult = cloneRuntimeValue(input.aiResult);
      if (!scan?.id || !audioFile?.id || !aiResult?.id) {
        throw repositoryError(400, "AUDIO_PROCESSING_INVALID", "Scan, audio and AI identities are required");
      }
      if (
        audioFile.scanId !== scan.id ||
        aiResult.scanId !== scan.id ||
        (scan.patientId && audioFile.patientId !== scan.patientId)
      ) {
        throw repositoryError(
          409,
          "AUDIO_PROCESSING_SCOPE_CONFLICT",
          "Processed artifacts do not belong to this scan",
        );
      }

      const persist = async () => {
        const runtimeDb = getDb();
        runtimeDb.scans = Array.isArray(runtimeDb.scans) ? runtimeDb.scans : [];
        runtimeDb.audioFiles = Array.isArray(runtimeDb.audioFiles) ? runtimeDb.audioFiles : [];
        runtimeDb.aiResults = Array.isArray(runtimeDb.aiResults) ? runtimeDb.aiResults : [];
        if (getPool()) {
          const persisted = await saveAudioProcessingSql({ scan, audioFile, aiResult });
          // PostgreSQL rows are canonical; retain runtime-only linkage fields
          // (for example audioFileId/aiResultId) on the in-process mirror.
          const persistedScan = persisted?.scan || {};
          syncArrayItem(runtimeDb.scans, {
            ...scan,
            ...persistedScan,
            processingGeneration: persistedScan.processingGeneration || scan.processingGeneration || 0,
            processingIntent: persistedScan.processingIntent || scan.processingIntent || "",
            processingArtifactFingerprint:
              persistedScan.processingArtifactFingerprint || scan.processingArtifactFingerprint || "",
            processingRunId: persistedScan.processingRunId || scan.processingRunId || "",
            audioFileId: persistedScan.audioFileId || scan.audioFileId || audioFile.id,
            aiResultId: persistedScan.aiResultId || scan.aiResultId || aiResult.id,
          });
          syncArrayItem(runtimeDb.audioFiles, { ...audioFile, ...(persisted?.audioFile || {}) });
          syncArrayItem(runtimeDb.aiResults, { ...aiResult, ...(persisted?.aiResult || {}) });
          if (typeof saveDb === "function") await saveDb();
          return {
            scan: runtimeDb.scans.find((item) => item.id === scan.id),
            audioFile: runtimeDb.audioFiles.find((item) => item.id === audioFile.id),
            aiResult: runtimeDb.aiResults.find((item) => item.id === aiResult.id),
          };
        }

        const currentScan = runtimeDb.scans.find((item) => item.id === scan.id);
        if (!currentScan) {
          throw repositoryError(404, "SCAN_NOT_FOUND", "Scan was not found");
        }
        if (
          (currentScan.organizationId && scan.organizationId && currentScan.organizationId !== scan.organizationId) ||
          (currentScan.patientId && scan.patientId && currentScan.patientId !== scan.patientId)
        ) {
          throw repositoryError(409, "SCAN_SCOPE_CONFLICT", "Processed artifacts do not belong to this scan");
        }
        const snapshot = {
          scans: JSON.parse(JSON.stringify(runtimeDb.scans || [])),
          audioFiles: JSON.parse(JSON.stringify(runtimeDb.audioFiles || [])),
          aiResults: JSON.parse(JSON.stringify(runtimeDb.aiResults || [])),
        };
        try {
          runtimeDb.scans = Array.isArray(runtimeDb.scans) ? runtimeDb.scans : [];
          runtimeDb.audioFiles = Array.isArray(runtimeDb.audioFiles) ? runtimeDb.audioFiles : [];
          runtimeDb.aiResults = Array.isArray(runtimeDb.aiResults) ? runtimeDb.aiResults : [];
          syncArrayItem(runtimeDb.scans, scan);
          syncArrayItem(runtimeDb.audioFiles, audioFile);
          syncArrayItem(runtimeDb.aiResults, aiResult);
          runtimeDb.audioFiles = runtimeDb.audioFiles.slice(0, 1000);
          runtimeDb.aiResults = runtimeDb.aiResults.slice(0, 1000);
          if (typeof saveDb === "function") await saveDb();
          return { scan, audioFile, aiResult };
        } catch (error) {
          runtimeDb.scans = snapshot.scans;
          runtimeDb.audioFiles = snapshot.audioFiles;
          runtimeDb.aiResults = snapshot.aiResults;
          throw error;
        }
      };

      return getPool() ? persist() : runAudioProcessingExclusive(scan.id, persist);
    },
  };

  const deviceCommands = {
    async save(command) {
      const nextCommand = cloneRuntimeValue(command);
      await upsertDeviceCommandSql(nextCommand);
      if (getPool()) {
        const runtimeDb = getDb();
        runtimeDb.deviceCommands = Array.isArray(runtimeDb.deviceCommands)
          ? runtimeDb.deviceCommands
          : [];
        syncArrayItem(runtimeDb.deviceCommands, nextCommand);
        runtimeDb.deviceCommands = runtimeDb.deviceCommands
          .sort((left, right) =>
            String(right.issuedAt || "").localeCompare(String(left.issuedAt || "")))
          .slice(0, 1000);
        try {
          await saveDb();
        } catch (error) {
          onSqlError(
            new Error(
              `PostgreSQL device command committed but runtime mirror refresh failed: ${error.message}`,
            ),
          );
        }
        return cloneRuntimeValue(nextCommand);
      }
      return runDeviceProvisionMutationExclusive(async () => {
        const runtimeDb = getDb();
        const snapshot = snapshotRuntimeDb(runtimeDb);
        try {
          runtimeDb.deviceCommands = Array.isArray(runtimeDb.deviceCommands)
            ? runtimeDb.deviceCommands
            : [];
          syncArrayItem(runtimeDb.deviceCommands, nextCommand);
          runtimeDb.deviceCommands = runtimeDb.deviceCommands
            .sort((left, right) =>
              String(right.issuedAt || "").localeCompare(String(left.issuedAt || "")))
            .slice(0, 1000);
          await saveDb();
          return cloneRuntimeValue(nextCommand);
        } catch (error) {
          restoreRuntimeDb(runtimeDb, snapshot);
          throw error;
        }
      });
    },

    async findById(deviceId, commandId) {
      const scopedDeviceId = String(deviceId || "");
      const scopedCommandId = String(commandId || "");
      const sqlCommand = await withSql(async (pool) => {
        const result = await pool.query(
          "SELECT * FROM device_commands WHERE device_id = $1 AND id = $2 LIMIT 1",
          [scopedDeviceId, scopedCommandId],
        );
        return result.rows[0] ? rowToDeviceCommand(result.rows[0]) : null;
      });
      if (sqlCommand) {
        const runtimeDb = getDb();
        runtimeDb.deviceCommands = Array.isArray(runtimeDb.deviceCommands) ? runtimeDb.deviceCommands : [];
        return cloneRuntimeValue(syncArrayItem(runtimeDb.deviceCommands, sqlCommand));
      }
      return cloneRuntimeValue(
        (getDb().deviceCommands || []).find(
          (command) => command.deviceId === scopedDeviceId && command.id === scopedCommandId,
        ) || null,
      );
    },

    async listForDevice(deviceId, limit = 100) {
      const scopedDeviceId = String(deviceId || "");
      const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
      const sqlCommands = await withSql(async (pool) => {
        const result = await pool.query(
          "SELECT * FROM device_commands WHERE device_id = $1 ORDER BY issued_at DESC LIMIT $2",
          [scopedDeviceId, boundedLimit],
        );
        return result.rows.map(rowToDeviceCommand);
      });
      if (sqlCommands && sqlCommands.length > 0) {
        const runtimeDb = getDb();
        runtimeDb.deviceCommands = Array.isArray(runtimeDb.deviceCommands) ? runtimeDb.deviceCommands : [];
        for (const command of sqlCommands) syncArrayItem(runtimeDb.deviceCommands, command);
        return cloneRuntimeValue(sqlCommands);
      }
      return cloneRuntimeValue(
        (getDb().deviceCommands || [])
          .filter((command) => command.deviceId === scopedDeviceId)
          .sort((left, right) =>
            String(right.issuedAt || "").localeCompare(String(left.issuedAt || "")))
          .slice(0, boundedLimit),
      );
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
      const runtimeDb = getDb();
      runtimeDb.notificationDevices = Array.isArray(runtimeDb.notificationDevices)
        ? runtimeDb.notificationDevices
        : [];
      const matchingTokens = runtimeDb.notificationDevices
        .filter((item) => item.fcmToken === input.fcmToken)
        .sort((left, right) =>
          String(right.updatedAt || right.createdAt || "").localeCompare(
            String(left.updatedAt || left.createdAt || ""),
          ),
        );
      const existing = matchingTokens[0] || null;
      const item = existing || {
        id: input.id || createId("ndev"),
        createdAt: nowIso(),
      };
      item.userId = input.userId;
      item.platform = input.platform || "android";
      item.fcmToken = input.fcmToken;
      item.enabled = input.enabled !== false;
      item.updatedAt = nowIso();
      runtimeDb.notificationDevices = runtimeDb.notificationDevices.filter(
        (candidate) => candidate.fcmToken !== item.fcmToken || candidate.id === item.id,
      );
      syncArrayItem(runtimeDb.notificationDevices, item);
      const sqlDevice = await upsertNotificationDeviceSql(item);
      const canonicalDevice = sqlDevice || item;
      runtimeDb.notificationDevices = runtimeDb.notificationDevices.filter(
        (candidate) => candidate.fcmToken !== canonicalDevice.fcmToken,
      );
      syncArrayItem(runtimeDb.notificationDevices, canonicalDevice);
      await saveDb();
      return canonicalDevice;
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
      const runtimeDb = getDb();
      runtimeDb.notificationDevices = Array.isArray(runtimeDb.notificationDevices)
        ? runtimeDb.notificationDevices
        : [];
      if (getPool()) {
        const sqlDevice = await withSql(async (pool) => {
          const result = await pool.query(
            `
              UPDATE notification_devices
              SET enabled = false, updated_at = now()
              WHERE user_id = $1 AND fcm_token = $2 AND enabled = true
              RETURNING *
            `,
            [id, token],
          );
          return result.rows[0] ? rowToNotificationDevice(result.rows[0]) : null;
        });
        if (!sqlDevice) return null;
        runtimeDb.notificationDevices = runtimeDb.notificationDevices.filter(
          (candidate) => candidate.fcmToken !== token,
        );
        syncArrayItem(runtimeDb.notificationDevices, sqlDevice);
        await saveDb();
        return sqlDevice;
      }
      const device = runtimeDb.notificationDevices.find(
        (item) => item.userId === id && item.fcmToken === token && item.enabled !== false,
      );
      if (!device) return null;
      device.enabled = false;
      device.updatedAt = nowIso();
      await saveDb();
      return device;
    },
  };

  function runtimeTwoFactorCollections() {
    const db = getDb();
    db.twoFactorCredentials = Array.isArray(db.twoFactorCredentials) ? db.twoFactorCredentials : [];
    db.twoFactorEnrollments = Array.isArray(db.twoFactorEnrollments) ? db.twoFactorEnrollments : [];
    db.twoFactorChallenges = Array.isArray(db.twoFactorChallenges) ? db.twoFactorChallenges : [];
    db.twoFactorTokens = Array.isArray(db.twoFactorTokens) ? db.twoFactorTokens : [];
    return db;
  }

  const twoFactor = {
    async getCredential(userId) {
      const actorId = String(userId || "");
      if (!actorId) return null;
      const pool = getPool();
      if (pool) {
        const result = await pool.query(
          `
            SELECT * FROM two_factor_credentials
            WHERE user_id = $1 AND disabled_at IS NULL
            LIMIT 1
          `,
          [actorId],
        );
        const credential = rowToTwoFactorCredential(result.rows[0]);
        const db = runtimeTwoFactorCollections();
        db.twoFactorCredentials = db.twoFactorCredentials.filter((item) => item.userId !== actorId);
        if (credential) db.twoFactorCredentials.push(credential);
        return credential;
      }
      return (
        runtimeTwoFactorCollections().twoFactorCredentials.find(
          (item) => item.userId === actorId && !item.disabledAt,
        ) || null
      );
    },

    async getPendingEnrollment(userId) {
      const actorId = String(userId || "");
      if (!actorId) return null;
      const pool = getPool();
      if (pool) {
        await pool.query(
          `
            UPDATE two_factor_enrollments
            SET consumed_at = now()
            WHERE user_id = $1 AND consumed_at IS NULL AND expires_at <= now()
          `,
          [actorId],
        );
        const result = await pool.query(
          `
            SELECT * FROM two_factor_enrollments
            WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [actorId],
        );
        const enrollment = rowToTwoFactorEnrollment(result.rows[0]);
        const db = runtimeTwoFactorCollections();
        const nowMs = Date.now();
        for (const item of db.twoFactorEnrollments) {
          if (item.userId === actorId && !item.consumedAt && Date.parse(item.expiresAt || "") <= nowMs) {
            item.consumedAt = nowIso();
          }
        }
        if (enrollment) syncArrayItem(db.twoFactorEnrollments, enrollment);
        return enrollment;
      }
      const db = runtimeTwoFactorCollections();
      const nowMs = Date.now();
      for (const item of db.twoFactorEnrollments) {
        if (item.userId === actorId && !item.consumedAt && Date.parse(item.expiresAt || "") <= nowMs) {
          item.consumedAt = nowIso();
        }
      }
      return (
        db.twoFactorEnrollments.find(
          (item) => item.userId === actorId && !item.consumedAt && Date.parse(item.expiresAt || "") > nowMs,
        ) || null
      );
    },

    async createEnrollment(record) {
      const actorId = String(record?.userId || "");
      if (!actorId || !record?.id || !record.secretCiphertext || !record.secretIv || !record.secretTag) {
        throw repositoryError(400, "TWO_FACTOR_ENROLLMENT_INPUT_INVALID", "Enrollment data is incomplete");
      }
      const pool = getPool();
      let persisted = record;
      if (pool) {
        persisted = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`2fa-enrollment:${actorId}`]);
          await client.query(
            `
              UPDATE two_factor_enrollments
              SET consumed_at = now()
              WHERE user_id = $1 AND consumed_at IS NULL AND expires_at <= now()
            `,
            [actorId],
          );
          const credentialResult = await client.query(
            "SELECT 1 FROM two_factor_credentials WHERE user_id = $1 AND disabled_at IS NULL LIMIT 1",
            [actorId],
          );
          if (credentialResult.rowCount) {
            throw repositoryError(409, "TWO_FACTOR_ALREADY_ENABLED", "Two-factor authentication is already enabled");
          }
          const pendingResult = await client.query(
            `
              SELECT id FROM two_factor_enrollments
              WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now()
              LIMIT 1
            `,
            [actorId],
          );
          if (pendingResult.rowCount) {
            throw repositoryError(
              409,
              "TWO_FACTOR_ENROLLMENT_PENDING",
              "A two-factor enrollment is already pending",
            );
          }
          const inserted = await client.query(
            `
              INSERT INTO two_factor_enrollments (
                id, user_id, method, secret_ciphertext, secret_iv, secret_tag, secret_version,
                attempts, max_attempts, created_at, expires_at, consumed_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)
              RETURNING *
            `,
            [
              record.id,
              actorId,
              record.method || "app",
              record.secretCiphertext,
              record.secretIv,
              record.secretTag,
              Number(record.secretVersion || 1),
              Number(record.attempts || 0),
              Number(record.maxAttempts || 5),
              record.createdAt,
              record.expiresAt,
            ],
          );
          return rowToTwoFactorEnrollment(inserted.rows[0]);
        });
      } else {
        const db = runtimeTwoFactorCollections();
        const nowMs = Date.now();
        for (const item of db.twoFactorEnrollments) {
          if (item.userId === actorId && !item.consumedAt && Date.parse(item.expiresAt || "") <= nowMs) {
            item.consumedAt = nowIso();
          }
        }
        if (db.twoFactorCredentials.some((item) => item.userId === actorId && !item.disabledAt)) {
          throw repositoryError(409, "TWO_FACTOR_ALREADY_ENABLED", "Two-factor authentication is already enabled");
        }
        if (
          db.twoFactorEnrollments.some(
            (item) => item.userId === actorId && !item.consumedAt && Date.parse(item.expiresAt || "") > nowMs,
          )
        ) {
          throw repositoryError(
            409,
            "TWO_FACTOR_ENROLLMENT_PENDING",
            "A two-factor enrollment is already pending",
          );
        }
      }
      syncArrayItem(runtimeTwoFactorCollections().twoFactorEnrollments, persisted);
      await saveDb();
      return persisted;
    },

    async getEnrollment(userId, enrollmentId) {
      const actorId = String(userId || "");
      const id = String(enrollmentId || "");
      if (!actorId || !id) return null;
      const pool = getPool();
      if (pool) {
        const result = await pool.query(
          "SELECT * FROM two_factor_enrollments WHERE id = $1 AND user_id = $2 LIMIT 1",
          [id, actorId],
        );
        const enrollment = rowToTwoFactorEnrollment(result.rows[0]);
        if (enrollment) syncArrayItem(runtimeTwoFactorCollections().twoFactorEnrollments, enrollment);
        return enrollment;
      }
      return (
        runtimeTwoFactorCollections().twoFactorEnrollments.find(
          (item) => item.id === id && item.userId === actorId,
        ) || null
      );
    },

    async recordEnrollmentFailure(userId, enrollmentId) {
      const actorId = String(userId || "");
      const id = String(enrollmentId || "");
      const pool = getPool();
      let enrollment;
      if (pool) {
        enrollment = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`2fa-enrollment:${id}`]);
          const result = await client.query(
            `
              UPDATE two_factor_enrollments
              SET attempts = LEAST(max_attempts, attempts + 1)
              WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL AND expires_at > now()
              RETURNING *
            `,
            [id, actorId],
          );
          if (!result.rowCount) {
            throw repositoryError(410, "TWO_FACTOR_ENROLLMENT_EXPIRED", "Enrollment is expired or unavailable");
          }
          return rowToTwoFactorEnrollment(result.rows[0]);
        });
      } else {
        enrollment = runtimeTwoFactorCollections().twoFactorEnrollments.find(
          (item) => item.id === id && item.userId === actorId,
        );
        if (!enrollment || enrollment.consumedAt || Date.parse(enrollment.expiresAt || "") <= Date.now()) {
          throw repositoryError(410, "TWO_FACTOR_ENROLLMENT_EXPIRED", "Enrollment is expired or unavailable");
        }
        enrollment.attempts = Math.min(Number(enrollment.maxAttempts || 5), Number(enrollment.attempts || 0) + 1);
      }
      syncArrayItem(runtimeTwoFactorCollections().twoFactorEnrollments, enrollment);
      await saveDb();
      return enrollment;
    },

    async confirmEnrollment(input = {}) {
      const actorId = String(input.userId || "");
      const enrollmentId = String(input.enrollmentId || "");
      const credential = input.credential;
      const tokenRecord = input.tokenRecord;
      if (!actorId || !enrollmentId || !credential || !tokenRecord) {
        throw repositoryError(400, "TWO_FACTOR_CONFIRMATION_INPUT_INVALID", "Confirmation data is incomplete");
      }
      const auditLog = createAuditLog({
        ...(input.auditInput || {}),
        action: "account.2fa.enable",
        actorUserId: actorId,
        resourceType: "user",
        resourceId: actorId,
      });
      const pool = getPool();
      let confirmedEnrollment;
      if (pool) {
        confirmedEnrollment = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`2fa-enrollment:${enrollmentId}`]);
          const enrollmentResult = await client.query(
            "SELECT * FROM two_factor_enrollments WHERE id = $1 AND user_id = $2 FOR UPDATE",
            [enrollmentId, actorId],
          );
          const enrollment = rowToTwoFactorEnrollment(enrollmentResult.rows[0]);
          if (!enrollment) {
            throw repositoryError(404, "TWO_FACTOR_ENROLLMENT_NOT_FOUND", "Enrollment was not found");
          }
          if (enrollment.consumedAt) {
            throw repositoryError(409, "TWO_FACTOR_ENROLLMENT_ALREADY_USED", "Enrollment was already verified");
          }
          if (Date.parse(enrollment.expiresAt || "") <= Date.now()) {
            throw repositoryError(410, "TWO_FACTOR_ENROLLMENT_EXPIRED", "Enrollment has expired");
          }
          if (Number(enrollment.attempts || 0) >= Number(enrollment.maxAttempts || 5)) {
            throw repositoryError(429, "TWO_FACTOR_ATTEMPTS_EXCEEDED", "Enrollment attempts were exhausted");
          }
          const insertedCredential = await client.query(
            `
              INSERT INTO two_factor_credentials (
                user_id, method, enrollment_id, secret_ciphertext, secret_iv, secret_tag, secret_version,
                recovery_salt, recovery_codes, last_used_time_step, enabled_at, updated_at, disabled_at, version
              )
              VALUES ($1, 'app', $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $10, NULL, 1)
              ON CONFLICT (user_id) DO UPDATE SET
                method = 'app', enrollment_id = EXCLUDED.enrollment_id,
                secret_ciphertext = EXCLUDED.secret_ciphertext, secret_iv = EXCLUDED.secret_iv,
                secret_tag = EXCLUDED.secret_tag, secret_version = EXCLUDED.secret_version,
                recovery_salt = EXCLUDED.recovery_salt, recovery_codes = EXCLUDED.recovery_codes,
                last_used_time_step = EXCLUDED.last_used_time_step, enabled_at = EXCLUDED.enabled_at,
                disable_attempts = 0, disable_locked_until = NULL,
                updated_at = EXCLUDED.updated_at, disabled_at = NULL, version = two_factor_credentials.version + 1
              WHERE two_factor_credentials.disabled_at IS NOT NULL
              RETURNING *
            `,
            [
              actorId,
              enrollmentId,
              credential.secretCiphertext,
              credential.secretIv,
              credential.secretTag,
              Number(credential.secretVersion || 1),
              credential.recoverySalt,
              JSON.stringify(credential.recoveryCodes || []),
              Number(credential.lastUsedTimeStep),
              credential.enabledAt,
            ],
          );
          if (!insertedCredential.rowCount) {
            throw repositoryError(409, "TWO_FACTOR_ALREADY_ENABLED", "Two-factor authentication is already enabled");
          }
          await client.query(
            "UPDATE two_factor_enrollments SET consumed_at = $3 WHERE id = $1 AND user_id = $2",
            [enrollmentId, actorId, credential.enabledAt],
          );
          await client.query(
            `
              INSERT INTO two_factor_tokens (
                id, user_id, token_hash, primary_binding_hash, created_at, expires_at, last_used_at, revoked_at
              ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)
            `,
            [
              tokenRecord.id,
              actorId,
              tokenRecord.tokenHash,
              tokenRecord.primaryBindingHash,
              tokenRecord.createdAt,
              tokenRecord.expiresAt,
            ],
          );
          await client.query(
            `
              UPDATE users
              SET firebase_claims = jsonb_set(
                COALESCE(firebase_claims, '{}'::jsonb),
                '{profile}',
                (
                  COALESCE(firebase_claims->'profile', '{}'::jsonb)
                    - 'twoFactorSecret'
                    - 'twoFactorSecretPreview'
                    - 'twoFactorRecoveryCodes'
                ) || jsonb_build_object('twoFactorEnabled', true, 'twoFactorMethod', 'app'),
                true
              ), updated_at = now()
              WHERE id = $1
            `,
            [actorId],
          );
          await queryInsertAuditLog(client, auditLog);
          return { ...enrollment, consumedAt: credential.enabledAt };
        });
      } else {
        const db = runtimeTwoFactorCollections();
        const enrollment = db.twoFactorEnrollments.find(
          (item) => item.id === enrollmentId && item.userId === actorId,
        );
        if (!enrollment) {
          throw repositoryError(404, "TWO_FACTOR_ENROLLMENT_NOT_FOUND", "Enrollment was not found");
        }
        if (enrollment.consumedAt) {
          throw repositoryError(409, "TWO_FACTOR_ENROLLMENT_ALREADY_USED", "Enrollment was already verified");
        }
        if (Date.parse(enrollment.expiresAt || "") <= Date.now()) {
          throw repositoryError(410, "TWO_FACTOR_ENROLLMENT_EXPIRED", "Enrollment has expired");
        }
        if (Number(enrollment.attempts || 0) >= Number(enrollment.maxAttempts || 5)) {
          throw repositoryError(429, "TWO_FACTOR_ATTEMPTS_EXCEEDED", "Enrollment attempts were exhausted");
        }
        if (db.twoFactorCredentials.some((item) => item.userId === actorId && !item.disabledAt)) {
          throw repositoryError(409, "TWO_FACTOR_ALREADY_ENABLED", "Two-factor authentication is already enabled");
        }
        enrollment.consumedAt = credential.enabledAt;
        confirmedEnrollment = enrollment;
      }
      const db = runtimeTwoFactorCollections();
      db.twoFactorCredentials = db.twoFactorCredentials.filter((item) => item.userId !== actorId);
      db.twoFactorCredentials.push(credential);
      syncArrayItem(db.twoFactorEnrollments, confirmedEnrollment);
      syncArrayItem(db.twoFactorTokens, tokenRecord);
      const user = db.users.find((item) => item.id === actorId);
      if (user) {
        delete user.twoFactorSecret;
        delete user.twoFactorSecretPreview;
        delete user.twoFactorRecoveryCodes;
        user.twoFactorEnabled = true;
        user.twoFactorMethod = "app";
        user.updatedAt = credential.enabledAt;
      }
      syncRuntimeAuditLog(auditLog);
      await saveDb();
      return { credential, tokenRecord, auditLog };
    },

    async createChallenge(record) {
      if (!record?.id || !record.userId || !record.primaryBindingHash || !record.primaryAuthSource) {
        throw repositoryError(400, "TWO_FACTOR_CHALLENGE_INPUT_INVALID", "Challenge data is incomplete");
      }
      const pool = getPool();
      let persisted = record;
      if (pool) {
        persisted = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `2fa-challenge-user:${record.userId}:${record.primaryAuthSource}`,
          ]);
          const existing = await client.query(
            `
              SELECT * FROM two_factor_challenges
              WHERE user_id = $1 AND primary_auth_source = $2
                AND completed_at IS NULL AND expires_at > now()
              ORDER BY created_at DESC LIMIT 1
            `,
            [record.userId, record.primaryAuthSource],
          );
          if (existing.rowCount) return rowToTwoFactorChallenge(existing.rows[0]);
          const inserted = await client.query(
            `
              INSERT INTO two_factor_challenges (
                id, user_id, primary_auth_source, primary_binding_hash,
                attempts, max_attempts, created_at, expires_at, completed_at
              ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, NULL)
              RETURNING *
            `,
            [
              record.id,
              record.userId,
              record.primaryAuthSource,
              record.primaryBindingHash,
              Number(record.maxAttempts || 5),
              record.createdAt,
              record.expiresAt,
            ],
          );
          return rowToTwoFactorChallenge(inserted.rows[0]);
        });
      } else {
        const db = runtimeTwoFactorCollections();
        const nowMs = Date.now();
        const existing = db.twoFactorChallenges.find(
          (item) =>
            item.userId === record.userId &&
            item.primaryAuthSource === record.primaryAuthSource &&
            !item.completedAt &&
            Date.parse(item.expiresAt || "") > nowMs,
        );
        if (existing) persisted = existing;
      }
      syncArrayItem(runtimeTwoFactorCollections().twoFactorChallenges, persisted);
      runtimeTwoFactorCollections().twoFactorChallenges = runtimeTwoFactorCollections().twoFactorChallenges.slice(-500);
      await saveDb();
      return persisted;
    },

    async getChallenge(challengeId) {
      const id = String(challengeId || "");
      if (!id) return null;
      const pool = getPool();
      if (pool) {
        const result = await pool.query("SELECT * FROM two_factor_challenges WHERE id = $1 LIMIT 1", [id]);
        const challenge = rowToTwoFactorChallenge(result.rows[0]);
        if (challenge) syncArrayItem(runtimeTwoFactorCollections().twoFactorChallenges, challenge);
        return challenge;
      }
      return runtimeTwoFactorCollections().twoFactorChallenges.find((item) => item.id === id) || null;
    },

    async verifyToken(input = {}) {
      const userId = String(input.userId || "");
      const tokenHash = String(input.tokenHash || "");
      const primaryBindingHash = String(input.primaryBindingHash || "");
      if (!userId || !tokenHash || !primaryBindingHash) return false;
      const pool = getPool();
      if (pool) {
        const result = await pool.query(
          `
            UPDATE two_factor_tokens
            SET last_used_at = now()
            WHERE user_id = $1 AND token_hash = $2 AND primary_binding_hash = $3
              AND revoked_at IS NULL AND expires_at > now()
            RETURNING *
          `,
          [userId, tokenHash, primaryBindingHash],
        );
        const token = rowToTwoFactorToken(result.rows[0]);
        if (token) syncArrayItem(runtimeTwoFactorCollections().twoFactorTokens, token);
        return Boolean(token);
      }
      const record = runtimeTwoFactorCollections().twoFactorTokens.find(
        (item) =>
          item.userId === userId &&
          item.tokenHash === tokenHash &&
          item.primaryBindingHash === primaryBindingHash &&
          !item.revokedAt &&
          Date.parse(item.expiresAt || "") > Date.now(),
      );
      if (!record) return false;
      record.lastUsedAt = nowIso();
      await saveDb();
      return true;
    },

    async completeChallenge(input = {}) {
      const challengeId = String(input.challengeId || "");
      const userId = String(input.userId || "");
      if (!challengeId || !userId || typeof input.verifyFactor !== "function" || !input.tokenRecord) {
        throw repositoryError(400, "TWO_FACTOR_CHALLENGE_INPUT_INVALID", "Challenge completion data is incomplete");
      }
      if (twoFactorChallengeInFlight.has(challengeId)) {
        await twoFactorChallengeInFlight.get(challengeId).catch(() => {});
        throw repositoryError(409, "TWO_FACTOR_CHALLENGE_ALREADY_USED", "Challenge was already submitted");
      }
      const execute = async () => {
        const auditLog = createAuditLog({
          ...(input.auditInput || {}),
          action: "auth.2fa.challenge.complete",
          actorUserId: userId,
          resourceType: "user",
          resourceId: userId,
        });
        const pool = getPool();
        let outcome;
        if (pool) {
          outcome = await withSqlTransaction(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`2fa-challenge:${challengeId}`]);
            const challengeResult = await client.query(
              "SELECT * FROM two_factor_challenges WHERE id = $1 AND user_id = $2 FOR UPDATE",
              [challengeId, userId],
            );
            const challenge = rowToTwoFactorChallenge(challengeResult.rows[0]);
            if (!challenge) throw repositoryError(404, "TWO_FACTOR_CHALLENGE_NOT_FOUND", "Challenge was not found");
            if (challenge.completedAt) {
              throw repositoryError(409, "TWO_FACTOR_CHALLENGE_ALREADY_USED", "Challenge was already completed");
            }
            if (Date.parse(challenge.expiresAt || "") <= Date.now()) {
              throw repositoryError(410, "TWO_FACTOR_CHALLENGE_EXPIRED", "Challenge has expired");
            }
            if (Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || 5)) {
              throw repositoryError(429, "TWO_FACTOR_ATTEMPTS_EXCEEDED", "Challenge attempts were exhausted");
            }
            const credentialResult = await client.query(
              "SELECT * FROM two_factor_credentials WHERE user_id = $1 AND disabled_at IS NULL FOR UPDATE",
              [userId],
            );
            const credential = rowToTwoFactorCredential(credentialResult.rows[0]);
            if (!credential) throw repositoryError(409, "TWO_FACTOR_NOT_ENABLED", "Two-factor authentication is not enabled");
            const factor = await input.verifyFactor(credential);
            if (!factor?.valid) {
              const nextAttempts = Number(challenge.attempts || 0) + 1;
              await client.query("UPDATE two_factor_challenges SET attempts = $2 WHERE id = $1", [challengeId, nextAttempts]);
              return { failure: factor || {}, attempts: nextAttempts, maxAttempts: Number(challenge.maxAttempts || 5) };
            }
            if (Number.isFinite(factor.timeStep)) credential.lastUsedTimeStep = Number(factor.timeStep);
            if (factor.recoveryCodeId) {
              const recovery = credential.recoveryCodes.find((item) => item.id === factor.recoveryCodeId && !item.usedAt);
              if (!recovery) {
                const nextAttempts = Number(challenge.attempts || 0) + 1;
                await client.query("UPDATE two_factor_challenges SET attempts = $2 WHERE id = $1", [challengeId, nextAttempts]);
                return {
                  failure: { code: "TWO_FACTOR_RECOVERY_CODE_INVALID" },
                  attempts: nextAttempts,
                  maxAttempts: Number(challenge.maxAttempts || 5),
                };
              }
              recovery.usedAt = factor.usedAt || nowIso();
            }
            credential.updatedAt = nowIso();
            credential.version = Number(credential.version || 1) + 1;
            await client.query(
              `
                UPDATE two_factor_credentials
                SET recovery_codes = $2::jsonb, last_used_time_step = $3, updated_at = $4, version = $5
                WHERE user_id = $1 AND disabled_at IS NULL
              `,
              [
                userId,
                JSON.stringify(credential.recoveryCodes || []),
                Number.isFinite(credential.lastUsedTimeStep) ? credential.lastUsedTimeStep : null,
                credential.updatedAt,
                credential.version,
              ],
            );
            const completedAt = nowIso();
            await client.query("UPDATE two_factor_challenges SET completed_at = $2 WHERE id = $1", [challengeId, completedAt]);
            await client.query(
              `
                INSERT INTO two_factor_tokens (
                  id, user_id, token_hash, primary_binding_hash, created_at, expires_at, last_used_at, revoked_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)
              `,
              [
                input.tokenRecord.id,
                userId,
                input.tokenRecord.tokenHash,
                input.tokenRecord.primaryBindingHash,
                input.tokenRecord.createdAt,
                input.tokenRecord.expiresAt,
              ],
            );
            await queryInsertAuditLog(client, auditLog);
            return { credential, completedAt };
          });
        } else {
          const db = runtimeTwoFactorCollections();
          const challenge = db.twoFactorChallenges.find((item) => item.id === challengeId && item.userId === userId);
          if (!challenge) throw repositoryError(404, "TWO_FACTOR_CHALLENGE_NOT_FOUND", "Challenge was not found");
          if (challenge.completedAt) {
            throw repositoryError(409, "TWO_FACTOR_CHALLENGE_ALREADY_USED", "Challenge was already completed");
          }
          if (Date.parse(challenge.expiresAt || "") <= Date.now()) {
            throw repositoryError(410, "TWO_FACTOR_CHALLENGE_EXPIRED", "Challenge has expired");
          }
          if (Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || 5)) {
            throw repositoryError(429, "TWO_FACTOR_ATTEMPTS_EXCEEDED", "Challenge attempts were exhausted");
          }
          const credential = db.twoFactorCredentials.find((item) => item.userId === userId && !item.disabledAt);
          if (!credential) throw repositoryError(409, "TWO_FACTOR_NOT_ENABLED", "Two-factor authentication is not enabled");
          const factor = await input.verifyFactor(credential);
          if (!factor?.valid) {
            challenge.attempts = Number(challenge.attempts || 0) + 1;
            outcome = {
              failure: factor || {},
              attempts: challenge.attempts,
              maxAttempts: Number(challenge.maxAttempts || 5),
            };
          } else {
            if (Number.isFinite(factor.timeStep)) credential.lastUsedTimeStep = Number(factor.timeStep);
            if (factor.recoveryCodeId) {
              const recovery = credential.recoveryCodes.find((item) => item.id === factor.recoveryCodeId && !item.usedAt);
              if (!recovery) {
                challenge.attempts = Number(challenge.attempts || 0) + 1;
                outcome = {
                  failure: { code: "TWO_FACTOR_RECOVERY_CODE_INVALID" },
                  attempts: challenge.attempts,
                  maxAttempts: Number(challenge.maxAttempts || 5),
                };
              } else {
                recovery.usedAt = factor.usedAt || nowIso();
              }
            }
            if (!outcome) {
              credential.updatedAt = nowIso();
              credential.version = Number(credential.version || 1) + 1;
              challenge.completedAt = nowIso();
              syncArrayItem(db.twoFactorTokens, input.tokenRecord);
              syncRuntimeAuditLog(auditLog);
              outcome = { credential, completedAt: challenge.completedAt };
            }
          }
        }
        await saveDb();
        if (outcome.failure) {
          const attemptsRemaining = Math.max(0, Number(outcome.maxAttempts || 5) - Number(outcome.attempts || 0));
          const code = outcome.failure.code || "TWO_FACTOR_CODE_INVALID";
          throw repositoryError(
            attemptsRemaining ? 401 : 429,
            attemptsRemaining ? code : "TWO_FACTOR_ATTEMPTS_EXCEEDED",
            attemptsRemaining ? "Second-factor code is invalid" : "Challenge attempts were exhausted",
            { attemptsRemaining },
          );
        }
        syncArrayItem(runtimeTwoFactorCollections().twoFactorCredentials, outcome.credential);
        const challenge = runtimeTwoFactorCollections().twoFactorChallenges.find((item) => item.id === challengeId);
        if (challenge) challenge.completedAt = outcome.completedAt;
        syncArrayItem(runtimeTwoFactorCollections().twoFactorTokens, input.tokenRecord);
        syncRuntimeAuditLog(auditLog);
        await saveDb();
        return { credential: outcome.credential, tokenRecord: input.tokenRecord, auditLog };
      };
      const promise = runTwoFactorUserExclusive(userId, execute);
      twoFactorChallengeInFlight.set(challengeId, promise);
      try {
        return await promise;
      } finally {
        if (twoFactorChallengeInFlight.get(challengeId) === promise) twoFactorChallengeInFlight.delete(challengeId);
      }
    },

    async disable(input = {}) {
      const userId = String(input.userId || "");
      if (!userId || typeof input.verifyFactor !== "function") {
        throw repositoryError(400, "TWO_FACTOR_DISABLE_INPUT_INVALID", "Disable confirmation is incomplete");
      }
      return runTwoFactorUserExclusive(userId, async () => {
      const auditLog = createAuditLog({
        ...(input.auditInput || {}),
        action: "account.2fa.disable",
        actorUserId: userId,
        resourceType: "user",
        resourceId: userId,
      });
      const disabledAt = nowIso();
      const pool = getPool();
      let credential;
      if (pool) {
        const outcome = await withSqlTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`2fa-disable:${userId}`]);
          const credentialResult = await client.query(
            "SELECT * FROM two_factor_credentials WHERE user_id = $1 AND disabled_at IS NULL FOR UPDATE",
            [userId],
          );
          const current = rowToTwoFactorCredential(credentialResult.rows[0]);
          if (!current) throw repositoryError(409, "TWO_FACTOR_NOT_ENABLED", "Two-factor authentication is not enabled");
          const lockedUntilMs = Date.parse(current.disableLockedUntil || "");
          if (Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now()) {
            throw repositoryError(
              429,
              "TWO_FACTOR_ATTEMPTS_EXCEEDED",
              "Disable verification is temporarily locked",
              { attemptsRemaining: 0, retryAt: current.disableLockedUntil },
            );
          }
          if (Number.isFinite(lockedUntilMs)) {
            current.disableAttempts = 0;
            current.disableLockedUntil = null;
          }
          let factor = await input.verifyFactor(current);
          if (factor?.valid && factor.recoveryCodeId) {
            const recovery = current.recoveryCodes.find((item) => item.id === factor.recoveryCodeId && !item.usedAt);
            if (!recovery) factor = { valid: false, code: "TWO_FACTOR_RECOVERY_CODE_INVALID" };
          }
          if (!factor?.valid) {
            const maxAttempts = 5;
            const attempts = Math.min(maxAttempts, Number(current.disableAttempts || 0) + 1);
            const retryAt = attempts >= maxAttempts
              ? new Date(Date.now() + getTwoFactorDisableLockMs()).toISOString()
              : null;
            current.disableAttempts = attempts;
            current.disableLockedUntil = retryAt;
            current.updatedAt = nowIso();
            current.version = Number(current.version || 1) + 1;
            await client.query(
              `
                UPDATE two_factor_credentials
                SET disable_attempts = $2, disable_locked_until = $3,
                    updated_at = $4, version = $5
                WHERE user_id = $1 AND disabled_at IS NULL
              `,
              [userId, attempts, retryAt, current.updatedAt, current.version],
            );
            return { failure: factor || {}, attempts, maxAttempts, retryAt, credential: current };
          }
          if (Number.isFinite(factor.timeStep)) current.lastUsedTimeStep = Number(factor.timeStep);
          if (factor.recoveryCodeId) {
            const recovery = current.recoveryCodes.find((item) => item.id === factor.recoveryCodeId && !item.usedAt);
            recovery.usedAt = factor.usedAt || disabledAt;
          }
          current.disableAttempts = 0;
          current.disableLockedUntil = null;
          current.disabledAt = disabledAt;
          current.updatedAt = disabledAt;
          current.version = Number(current.version || 1) + 1;
          await client.query(
            `
              UPDATE two_factor_credentials
              SET recovery_codes = $2::jsonb, last_used_time_step = $3,
                  disable_attempts = 0, disable_locked_until = NULL,
                  disabled_at = $4, updated_at = $4, version = $5
              WHERE user_id = $1 AND disabled_at IS NULL
            `,
            [
              userId,
              JSON.stringify(current.recoveryCodes || []),
              Number.isFinite(current.lastUsedTimeStep) ? current.lastUsedTimeStep : null,
              disabledAt,
              current.version,
            ],
          );
          await client.query(
            "UPDATE two_factor_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
            [userId, disabledAt],
          );
          await client.query(
            `
              UPDATE users
              SET firebase_claims = jsonb_set(
                COALESCE(firebase_claims, '{}'::jsonb),
                '{profile}',
                (
                  COALESCE(firebase_claims->'profile', '{}'::jsonb)
                    - 'twoFactorSecret'
                    - 'twoFactorSecretPreview'
                    - 'twoFactorRecoveryCodes'
                ) || jsonb_build_object('twoFactorEnabled', false, 'twoFactorMethod', ''),
                true
              ), updated_at = now()
              WHERE id = $1
            `,
            [userId],
          );
          await queryInsertAuditLog(client, auditLog);
          return { credential: current };
        });
        if (outcome.failure) {
          syncArrayItem(runtimeTwoFactorCollections().twoFactorCredentials, outcome.credential);
          await saveDb();
          const attemptsRemaining = Math.max(0, Number(outcome.maxAttempts || 5) - Number(outcome.attempts || 0));
          throw repositoryError(
            attemptsRemaining ? 401 : 429,
            attemptsRemaining ? outcome.failure.code || "TWO_FACTOR_CODE_INVALID" : "TWO_FACTOR_ATTEMPTS_EXCEEDED",
            attemptsRemaining ? "Current second-factor code is invalid" : "Disable verification attempts were exhausted",
            { attemptsRemaining, retryAt: outcome.retryAt || null },
          );
        }
        credential = outcome.credential;
      } else {
        const db = runtimeTwoFactorCollections();
        credential = db.twoFactorCredentials.find((item) => item.userId === userId && !item.disabledAt);
        if (!credential) throw repositoryError(409, "TWO_FACTOR_NOT_ENABLED", "Two-factor authentication is not enabled");
        const lockedUntilMs = Date.parse(credential.disableLockedUntil || "");
        if (Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now()) {
          throw repositoryError(
            429,
            "TWO_FACTOR_ATTEMPTS_EXCEEDED",
            "Disable verification is temporarily locked",
            { attemptsRemaining: 0, retryAt: credential.disableLockedUntil },
          );
        }
        if (Number.isFinite(lockedUntilMs)) {
          credential.disableAttempts = 0;
          credential.disableLockedUntil = null;
        }
        let factor = await input.verifyFactor(credential);
        if (factor?.valid && factor.recoveryCodeId) {
          const recovery = credential.recoveryCodes.find((item) => item.id === factor.recoveryCodeId && !item.usedAt);
          if (!recovery) factor = { valid: false, code: "TWO_FACTOR_RECOVERY_CODE_INVALID" };
        }
        if (!factor?.valid) {
          const maxAttempts = 5;
          const attempts = Math.min(maxAttempts, Number(credential.disableAttempts || 0) + 1);
          const retryAt = attempts >= maxAttempts
            ? new Date(Date.now() + getTwoFactorDisableLockMs()).toISOString()
            : null;
          credential.disableAttempts = attempts;
          credential.disableLockedUntil = retryAt;
          credential.updatedAt = nowIso();
          credential.version = Number(credential.version || 1) + 1;
          syncArrayItem(db.twoFactorCredentials, credential);
          await saveDb();
          const attemptsRemaining = Math.max(0, maxAttempts - attempts);
          throw repositoryError(
            attemptsRemaining ? 401 : 429,
            attemptsRemaining ? factor?.code || "TWO_FACTOR_CODE_INVALID" : "TWO_FACTOR_ATTEMPTS_EXCEEDED",
            attemptsRemaining ? "Current second-factor code is invalid" : "Disable verification attempts were exhausted",
            { attemptsRemaining, retryAt },
          );
        }
        if (Number.isFinite(factor.timeStep)) credential.lastUsedTimeStep = Number(factor.timeStep);
        if (factor.recoveryCodeId) {
          const recovery = credential.recoveryCodes.find((item) => item.id === factor.recoveryCodeId && !item.usedAt);
          recovery.usedAt = factor.usedAt || disabledAt;
        }
        credential.disableAttempts = 0;
        credential.disableLockedUntil = null;
        credential.disabledAt = disabledAt;
        credential.updatedAt = disabledAt;
        credential.version = Number(credential.version || 1) + 1;
      }
      const db = runtimeTwoFactorCollections();
      syncArrayItem(db.twoFactorCredentials, credential);
      for (const token of db.twoFactorTokens) {
        if (token.userId === userId && !token.revokedAt) token.revokedAt = disabledAt;
      }
      const user = db.users.find((item) => item.id === userId);
      if (user) {
        delete user.twoFactorSecret;
        delete user.twoFactorSecretPreview;
        delete user.twoFactorRecoveryCodes;
        user.twoFactorEnabled = false;
        user.twoFactorMethod = "";
        user.updatedAt = disabledAt;
      }
      syncRuntimeAuditLog(auditLog);
      await saveDb();
      return { credential, auditLog, disabledAt };
      });
    },
  };

  function runtimeChatMessagesForScope(userId, organizationId) {
    const db = getDb();
    db.chatMessages = Array.isArray(db.chatMessages) ? db.chatMessages : [];
    return db.chatMessages
      .filter((message) => message.userId === userId && message.organizationId === organizationId)
      .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
      .slice(-100);
  }

  function syncRuntimeChatExchange(messages, auditLog, idempotency, responseBody, responseStatus) {
    const db = getDb();
    db.chatMessages = Array.isArray(db.chatMessages) ? db.chatMessages : [];
    db.idempotencyKeys = Array.isArray(db.idempotencyKeys) ? db.idempotencyKeys : [];
    for (const message of messages) syncArrayItem(db.chatMessages, message);
    db.chatMessages = db.chatMessages.slice(-500);
    if (auditLog) syncRuntimeAuditLog(auditLog);
    if (idempotency && idempotency.key) {
      db.idempotencyKeys.unshift({
        id: createId("idem"),
        scope: idempotency.scope,
        operation: idempotency.operation,
        key: idempotency.key,
        fingerprint: idempotency.fingerprint,
        resourceType: "ai_chat",
        resourceId: responseBody?.message?.id || "",
        responseStatus,
        responseResource: responseBody,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastSeenAt: nowIso(),
      });
      db.idempotencyKeys = db.idempotencyKeys.slice(0, 500);
    }
  }

  const chatMessages = {
    async listByScope(userId, organizationId) {
      const actorId = String(userId || "");
      const workspaceId = String(organizationId || "");
      if (!actorId || !workspaceId) return [];
      const sqlMessages = await withSql(async (pool) => {
        const result = await pool.query(
          `
            SELECT *
            FROM chat_messages
            WHERE user_id = $1 AND organization_id = $2
            ORDER BY created_at ASC
            LIMIT 100
          `,
          [actorId, workspaceId],
        );
        return result.rows.map(rowToChatMessage);
      });
      const merged = new Map();
      for (const message of runtimeChatMessagesForScope(actorId, workspaceId)) merged.set(message.id, message);
      for (const message of sqlMessages || []) merged.set(message.id, message);
      return [...merged.values()]
        .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
        .slice(-100);
    },

    async executeWithAudit(input = {}) {
      const actorId = String(input.userId || "");
      const workspaceId = String(input.organizationId || "");
      const idempotency = input.idempotency && input.idempotency.key
        ? {
            scope: String(input.idempotency.scope || ""),
            operation: String(input.idempotency.operation || ""),
            key: String(input.idempotency.key || ""),
            fingerprint: String(input.idempotency.fingerprint || ""),
          }
        : null;
      if (!actorId || !workspaceId || typeof input.createExchange !== "function") {
        throw repositoryError(400, "AI_CHAT_INPUT_INVALID", "AI chat exchange input is invalid");
      }
      const inFlightKey = idempotency
        ? `${idempotency.scope}:${idempotency.operation}:${idempotency.key}`
        : "";
      if (inFlightKey && aiChatInFlight.has(inFlightKey)) {
        const active = aiChatInFlight.get(inFlightKey);
        if (active.fingerprint !== idempotency.fingerprint) {
          throw repositoryError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "Idempotency-Key was already used with a different request payload",
          );
        }
        const result = await active.promise;
        return { ...result, replayed: true, auditLog: null };
      }

      const execute = async () => {
        if (!getPool()) {
          const existing = idempotency ? findRuntimeIdempotency(idempotency) : null;
          if (existing) {
            assertIdempotencyFingerprint(existing, idempotency);
            existing.lastSeenAt = nowIso();
            return {
              responseBody: existing.responseResource || {},
              responseStatus: Number(existing.responseStatus || input.responseStatus || 200),
              replayed: true,
              auditLog: null,
            };
          }
          const previousMessages = runtimeChatMessagesForScope(actorId, workspaceId);
          const exchange = await input.createExchange(previousMessages);
          const messages = Array.isArray(exchange.messages) ? exchange.messages : [];
          const auditLog = createAuditLog({
            ...(exchange.auditInput || {}),
            actorUserId: actorId,
            organizationId: workspaceId,
            resourceType: "ai_message",
            resourceId: exchange.responseBody?.message?.id || "",
          });
          const responseStatus = Number(exchange.responseStatus || input.responseStatus || 200);
          syncRuntimeChatExchange(messages, auditLog, idempotency, exchange.responseBody, responseStatus);
          await saveDb();
          return {
            responseBody: exchange.responseBody,
            responseStatus,
            replayed: false,
            auditLog,
          };
        }

        const pool = getPool();
        const client = typeof pool.connect === "function" ? await pool.connect() : pool;
        const advisoryKey = idempotency
          ? `${idempotency.scope}:${idempotency.operation}:${idempotency.key}`
          : `ai-chat:${workspaceId}:${actorId}`;
        let locked = false;
        try {
          await client.query("SELECT pg_advisory_lock(hashtext($1))", [advisoryKey]);
          locked = true;
          if (idempotency) {
            const existingResult = await client.query(
              `
                SELECT fingerprint, response_status, response_json
                FROM mutation_idempotency
                WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
                LIMIT 1
              `,
              [idempotency.scope, idempotency.operation, idempotency.key],
            );
            const existing = existingResult.rows[0];
            if (existing) {
              assertIdempotencyFingerprint(existing, idempotency);
              return {
                responseBody: existing.response_json || {},
                responseStatus: Number(existing.response_status || input.responseStatus || 200),
                replayed: true,
                auditLog: null,
              };
            }
          }

          const previousResult = await client.query(
            `
              SELECT *
              FROM chat_messages
              WHERE user_id = $1 AND organization_id = $2
              ORDER BY created_at ASC
              LIMIT 100
            `,
            [actorId, workspaceId],
          );
          const previousById = new Map();
          for (const message of runtimeChatMessagesForScope(actorId, workspaceId)) previousById.set(message.id, message);
          for (const row of previousResult.rows) {
            const message = rowToChatMessage(row);
            previousById.set(message.id, message);
          }
          const previousMessages = [...previousById.values()]
            .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
            .slice(-100);
          const exchange = await input.createExchange(previousMessages);
          const messages = Array.isArray(exchange.messages) ? exchange.messages : [];
          const auditLog = createAuditLog({
            ...(exchange.auditInput || {}),
            actorUserId: actorId,
            organizationId: workspaceId,
            resourceType: "ai_message",
            resourceId: exchange.responseBody?.message?.id || "",
          });
          const responseStatus = Number(exchange.responseStatus || input.responseStatus || 200);

          await client.query("BEGIN");
          try {
            for (const message of messages) await queryInsertChatMessage(client, message);
            await queryInsertAuditLog(client, auditLog);
            if (idempotency) {
              await client.query(
                `
                  INSERT INTO mutation_idempotency (
                    id, scope, operation, idempotency_key, fingerprint,
                    resource_type, resource_id, response_status, response_json, created_at, updated_at
                  )
                  VALUES ($1, $2, $3, $4, $5, 'ai_chat', $6, $7, $8::jsonb, now(), now())
                `,
                [
                  createId("idem"),
                  idempotency.scope,
                  idempotency.operation,
                  idempotency.key,
                  idempotency.fingerprint,
                  exchange.responseBody?.message?.id || "",
                  responseStatus,
                  JSON.stringify(exchange.responseBody || {}),
                ],
              );
            }
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            throw error;
          }
          syncRuntimeChatExchange(messages, auditLog, idempotency, exchange.responseBody, responseStatus);
          await saveDb();
          return {
            responseBody: exchange.responseBody,
            responseStatus,
            replayed: false,
            auditLog,
          };
        } finally {
          if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [advisoryKey]).catch(() => {});
          if (client !== pool && typeof client.release === "function") client.release();
        }
      };

      if (!inFlightKey) return execute();
      const promise = execute();
      aiChatInFlight.set(inFlightKey, { fingerprint: idempotency.fingerprint, promise });
      try {
        return await promise;
      } finally {
        if (aiChatInFlight.get(inFlightKey)?.promise === promise) aiChatInFlight.delete(inFlightKey);
      }
    },
  };

  function runtimeServicePackages() {
    const db = getDb();
    db.servicePackages = Array.isArray(db.servicePackages) ? db.servicePackages : [];
    return db.servicePackages;
  }

  function servicePackageReplayBody(entry) {
    const stored = cloneRuntimeValue(entry?.responseResource || entry?.response_json || {});
    if (stored?.package?.id) return stored;
    if (stored?.id) return { package: stored };
    throw repositoryError(
      409,
      "IDEMPOTENCY_OUTCOME_UNAVAILABLE",
      "The stored package mutation outcome is incomplete and cannot be replayed safely",
    );
  }

  function assertRuntimePackageAvailableForArchive(runtimeDb, packageId) {
    const workspace = (runtimeDb.organizations || []).find((item) => item.packageId === packageId);
    const subscription = (runtimeDb.subscriptions || []).find(
      (item) => item.packageId === packageId && !item.canceledAt,
    );
    if (workspace || subscription) {
      throw repositoryError(
        409,
        "PACKAGE_ASSIGNED",
        "Assigned packages must be moved to another package before archival",
        {
          workspaceId: workspace?.id || subscription?.organizationId || "",
        },
      );
    }
  }

  function assertRuntimePackageUnique(runtimeDb, servicePackage, currentId = "") {
    const idDuplicate = (runtimeDb.servicePackages || []).find(
      (item) => item.id === servicePackage.id && item.id !== currentId,
    );
    if (idDuplicate) {
      throw repositoryError(409, "PACKAGE_ID_CONFLICT", "A package with this id already exists");
    }
    const normalizedName = String(servicePackage.name || "").trim().toLowerCase();
    const nameDuplicate = (runtimeDb.servicePackages || []).find(
      (item) => item.id !== currentId && String(item.name || "").trim().toLowerCase() === normalizedName,
    );
    if (nameDuplicate) {
      throw repositoryError(409, "PACKAGE_NAME_CONFLICT", "A package with this name already exists");
    }
  }

  async function queryInsertServicePackage(queryable, servicePackage) {
    const result = await queryable.query(
      `
        INSERT INTO service_packages (
          id, name, type, segment, price, currency, duration,
          max_devices, max_doctors, max_patients, storage_gb, ai_monthly,
          retention_days, features, status, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14::jsonb, $15,
          $16::timestamptz, $17::timestamptz
        )
        RETURNING *
      `,
      [
        servicePackage.id,
        servicePackage.name,
        servicePackage.type,
        servicePackage.segment,
        servicePackage.price,
        servicePackage.currency,
        servicePackage.duration,
        servicePackage.maxDevices,
        servicePackage.maxDoctors,
        servicePackage.maxPatients,
        servicePackage.storageGb,
        servicePackage.aiMonthly,
        servicePackage.retentionDays,
        JSON.stringify(servicePackage.features || {}),
        servicePackage.status,
        servicePackage.createdAt,
        servicePackage.updatedAt,
      ],
    );
    return rowToServicePackage(result.rows[0]);
  }

  async function queryUpdateServicePackage(queryable, servicePackage) {
    const result = await queryable.query(
      `
        UPDATE service_packages
        SET name = $2,
            type = $3,
            segment = $4,
            price = $5,
            currency = $6,
            duration = $7,
            max_devices = $8,
            max_doctors = $9,
            max_patients = $10,
            storage_gb = $11,
            ai_monthly = $12,
            retention_days = $13,
            features = $14::jsonb,
            status = $15,
            updated_at = $16::timestamptz
        WHERE id = $1
        RETURNING *
      `,
      [
        servicePackage.id,
        servicePackage.name,
        servicePackage.type,
        servicePackage.segment,
        servicePackage.price,
        servicePackage.currency,
        servicePackage.duration,
        servicePackage.maxDevices,
        servicePackage.maxDoctors,
        servicePackage.maxPatients,
        servicePackage.storageGb,
        servicePackage.aiMonthly,
        servicePackage.retentionDays,
        JSON.stringify(servicePackage.features || {}),
        servicePackage.status,
        servicePackage.updatedAt,
      ],
    );
    if (!result.rows[0]) {
      throw repositoryError(404, "PACKAGE_NOT_FOUND", "Package was not found");
    }
    return rowToServicePackage(result.rows[0]);
  }

  async function mutateRuntimeServicePackage(input) {
    return runServicePackageMutationExclusive(async () => {
      const runtimeDb = getDb();
      runtimeDb.servicePackages = Array.isArray(runtimeDb.servicePackages) ? runtimeDb.servicePackages : [];
      runtimeDb.idempotencyKeys = Array.isArray(runtimeDb.idempotencyKeys) ? runtimeDb.idempotencyKeys : [];
      const snapshot = snapshotRuntimeDb(runtimeDb);
      try {
        const existing = findRuntimeIdempotency(input.idempotency);
        if (existing) {
          assertIdempotencyFingerprint(existing, input.idempotency);
          existing.lastSeenAt = nowIso();
          return {
            responseBody: servicePackageReplayBody(existing),
            responseStatus: Number(existing.responseStatus || input.responseStatus),
            replayed: true,
            auditLog: null,
          };
        }

        const current = input.kind === "create"
          ? null
          : runtimeDb.servicePackages.find((item) => item.id === input.packageId) || null;
        if (input.kind !== "create" && !current) {
          throw repositoryError(404, "PACKAGE_NOT_FOUND", "Package was not found");
        }

        let servicePackage;
        if (input.kind === "create") {
          servicePackage = normalizeServicePackageCreate(input.payload, {
            id: input.packageId,
            now: nowIso(),
          });
          assertRuntimePackageUnique(runtimeDb, servicePackage);
        } else if (input.kind === "archive") {
          assertRuntimePackageAvailableForArchive(runtimeDb, input.packageId);
          servicePackage = normalizeServicePackagePatch(current, { status: "archived" }, { now: nowIso() });
        } else {
          servicePackage = normalizeServicePackagePatch(current, input.payload, { now: nowIso() });
          assertRuntimePackageUnique(runtimeDb, servicePackage, current.id);
        }

        const responseBody = input.kind === "archive"
          ? { package: cloneRuntimeValue(servicePackage), archived: true, packageId: servicePackage.id }
          : { package: cloneRuntimeValue(servicePackage) };
        const auditLog = createAuditLog({
          ...(input.audit || {}),
          action: input.audit?.action || `package.${input.kind}`,
          resourceType: "service_package",
          resourceId: servicePackage.id,
          metadata: {
            ...(input.audit?.metadata || {}),
            status: servicePackage.status,
          },
        });
        syncArrayItem(runtimeDb.servicePackages, servicePackage);
        syncRuntimeAuditLog(auditLog);
        syncRuntimeMutationIdempotency(
          input.idempotency,
          "service_package",
          servicePackage.id,
          input.responseStatus,
          responseBody,
        );
        await saveDb();
        return {
          responseBody,
          responseStatus: input.responseStatus,
          replayed: false,
          auditLog,
        };
      } catch (error) {
        restoreRuntimeDb(runtimeDb, snapshot);
        throw error;
      }
    });
  }

  async function mutateSqlServicePackage(input) {
    const result = await withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["service-package:catalog"]);
      const replay = await findSqlMutationReplay(client, input.idempotency);
      if (replay) {
        return {
          responseBody: servicePackageReplayBody(replay),
          responseStatus: Number(replay.response_status || input.responseStatus),
          replayed: true,
          auditLog: null,
        };
      }

      const selected = input.kind === "create"
        ? { rows: [] }
        : await client.query("SELECT * FROM service_packages WHERE id = $1 LIMIT 1 FOR UPDATE", [input.packageId]);
      const current = selected.rows[0] ? rowToServicePackage(selected.rows[0]) : null;
      if (input.kind !== "create" && !current) {
        throw repositoryError(404, "PACKAGE_NOT_FOUND", "Package was not found");
      }

      let servicePackage;
      if (input.kind === "create") {
        servicePackage = normalizeServicePackageCreate(input.payload, {
          id: input.packageId,
          now: nowIso(),
        });
        const duplicate = await client.query(
          `
            SELECT id, name
            FROM service_packages
            WHERE id = $1 OR lower(btrim(name)) = lower(btrim($2))
            ORDER BY id
            FOR UPDATE
          `,
          [servicePackage.id, servicePackage.name],
        );
        const idDuplicate = duplicate.rows.find((row) => row.id === servicePackage.id);
        if (idDuplicate) {
          throw repositoryError(409, "PACKAGE_ID_CONFLICT", "A package with this id already exists");
        }
        if (duplicate.rows.length > 0) {
          throw repositoryError(409, "PACKAGE_NAME_CONFLICT", "A package with this name already exists");
        }
        servicePackage = await queryInsertServicePackage(client, servicePackage);
      } else {
        if (input.kind === "archive") {
          const assignment = await client.query(
            "SELECT id FROM organizations WHERE package_id = $1 ORDER BY id LIMIT 1 FOR UPDATE",
            [input.packageId],
          );
          if (assignment.rows[0]) {
            throw repositoryError(
              409,
              "PACKAGE_ASSIGNED",
              "Assigned packages must be moved to another package before archival",
              { workspaceId: assignment.rows[0].id },
            );
          }
          servicePackage = normalizeServicePackagePatch(current, { status: "archived" }, { now: nowIso() });
        } else {
          servicePackage = normalizeServicePackagePatch(current, input.payload, { now: nowIso() });
          const duplicate = await client.query(
            `
              SELECT id
              FROM service_packages
              WHERE id <> $1 AND lower(btrim(name)) = lower(btrim($2))
              ORDER BY id
              LIMIT 1
              FOR UPDATE
            `,
            [servicePackage.id, servicePackage.name],
          );
          if (duplicate.rows[0]) {
            throw repositoryError(409, "PACKAGE_NAME_CONFLICT", "A package with this name already exists");
          }
        }
        servicePackage = await queryUpdateServicePackage(client, servicePackage);
      }

      const responseBody = input.kind === "archive"
        ? { package: cloneRuntimeValue(servicePackage), archived: true, packageId: servicePackage.id }
        : { package: cloneRuntimeValue(servicePackage) };
      const auditLog = createAuditLog({
        ...(input.audit || {}),
        action: input.audit?.action || `package.${input.kind}`,
        resourceType: "service_package",
        resourceId: servicePackage.id,
        metadata: {
          ...(input.audit?.metadata || {}),
          status: servicePackage.status,
        },
      });
      await queryInsertAuditLog(client, auditLog);
      await insertSqlMutationIdempotency(
        client,
        input.idempotency,
        "service_package",
        servicePackage.id,
        input.responseStatus,
        responseBody,
      );
      return {
        responseBody,
        responseStatus: input.responseStatus,
        replayed: false,
        auditLog,
      };
    });

    const servicePackage = result.responseBody?.package;
    if (servicePackage) syncArrayItem(runtimeServicePackages(), servicePackage);
    if (result.auditLog) syncRuntimeAuditLog(result.auditLog);
    if (servicePackage) {
      syncRuntimeMutationIdempotency(
        input.idempotency,
        "service_package",
        servicePackage.id,
        result.responseStatus,
        result.responseBody,
      );
    }
    await saveDb();
    return result;
  }

  async function mutateServicePackage(input) {
    if (!input?.idempotency?.key) {
      throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    }
    return getPool() ? mutateSqlServicePackage(input) : mutateRuntimeServicePackage(input);
  }

  const servicePackages = {
    async list() {
      const runtimeItems = runtimeServicePackages();
      if (getPool()) {
        const result = await withSql((pool) =>
          pool.query(
            "SELECT * FROM service_packages ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC, id ASC",
          ),
        );
        const canonical = (result?.rows || []).map(rowToServicePackage);
        getDb().servicePackages = canonical.map((item) => cloneRuntimeValue(item));
        return canonical;
      }
      return runtimeItems
        .map((item) => cloneRuntimeValue(item))
        .sort((left, right) =>
          Number(left.status === "archived") - Number(right.status === "archived") ||
          String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")) ||
          String(left.id || "").localeCompare(String(right.id || "")),
        );
    },

    async findById(id) {
      const packageId = String(id || "");
      if (getPool()) {
        const result = await withSql((pool) =>
          pool.query("SELECT * FROM service_packages WHERE id = $1 LIMIT 1", [packageId]),
        );
        const canonical = result?.rows?.[0] ? rowToServicePackage(result.rows[0]) : null;
        if (canonical) syncArrayItem(runtimeServicePackages(), canonical);
        else getDb().servicePackages = runtimeServicePackages().filter((item) => item.id !== packageId);
        return canonical;
      }
      return runtimeServicePackages().find((item) => item.id === packageId) || null;
    },

    async create(input = {}) {
      return mutateServicePackage({ ...input, kind: "create", responseStatus: 201 });
    },

    async update(input = {}) {
      return mutateServicePackage({ ...input, kind: "update", responseStatus: 200 });
    },

    async archive(input = {}) {
      return mutateServicePackage({ ...input, kind: "archive", payload: {}, responseStatus: 200 });
    },
  };

  const auditLogs = {
    async list(input = {}) {
      const filters = normalizeAuditLogQuery(input);
      if (!getPool()) {
        return filterAndPageAuditLogs(getDb().auditLogs || [], filters);
      }

      const pageResult = await withSql(async (pool) => {
        const clauses = [];
        const parameters = [];
        const bind = (value) => {
          parameters.push(value);
          return `$${parameters.length}`;
        };
        if (filters.organizationId) {
          clauses.push(`organization_id = ${bind(filters.organizationId)}`);
        }
        if (filters.action) clauses.push(`action = ${bind(filters.action)}`);
        if (filters.resourceType) clauses.push(`resource_type = ${bind(filters.resourceType)}`);
        if (filters.actorUserId) clauses.push(`actor_user_id = ${bind(filters.actorUserId)}`);
        if (filters.startDate) clauses.push(`created_at >= ${bind(filters.startDate)}::date`);
        if (filters.endDate) clauses.push(`created_at < (${bind(filters.endDate)}::date + INTERVAL '1 day')`);
        if (filters.q) {
          const q = bind(filters.q);
          clauses.push(
            `POSITION(${q} IN LOWER(CONCAT_WS(' ', id, actor_user_id, organization_id, action, resource_type, resource_id, ip::text, user_agent))) > 0`,
          );
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
        const orderBy = {
          "createdAt:desc": "created_at DESC, id DESC",
          "createdAt:asc": "created_at ASC, id ASC",
          "action:asc": "action ASC, created_at DESC, id DESC",
          "action:desc": "action DESC, created_at DESC, id DESC",
        }[filters.sort];
        const count = await pool.query(`SELECT COUNT(*)::bigint AS total FROM audit_logs ${where}`, parameters);
        const rows = await pool.query(
          `SELECT * FROM audit_logs ${where} ORDER BY ${orderBy} LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
          [...parameters, filters.limit, (filters.page - 1) * filters.limit],
        );
        return {
          items: rows.rows.map(rowToAuditLog),
          total: Number(count.rows[0]?.total || 0),
          page: filters.page,
          limit: filters.limit,
          sort: filters.sort,
        };
      });
      pageResult.items.forEach(syncRuntimeAuditLog);
      return pageResult;
    },

    async listForExport(input = {}) {
      const filters = normalizeAuditLogQuery({ ...input, page: 1, limit: 100 });
      const tooLarge = () =>
        repositoryError(
          413,
          "AUDIT_EXPORT_TOO_LARGE",
          "Narrow the audit export filters to 50,000 records or fewer",
        );
      if (!getPool()) {
        const frozenLogs = [...(getDb().auditLogs || [])];
        const exportedLogs = [];
        let page = 1;
        let total = 0;
        do {
          const result = filterAndPageAuditLogs(frozenLogs, { ...filters, page, limit: 100 });
          total = result.total;
          if (total > 50_000) throw tooLarge();
          exportedLogs.push(...result.items);
          page += 1;
        } while (exportedLogs.length < total);
        return exportedLogs;
      }

      const exportedLogs = await withSql(async (pool) => {
        const clauses = [];
        const parameters = [];
        const bind = (value) => {
          parameters.push(value);
          return `$${parameters.length}`;
        };
        if (filters.organizationId) clauses.push(`organization_id = ${bind(filters.organizationId)}`);
        if (filters.action) clauses.push(`action = ${bind(filters.action)}`);
        if (filters.resourceType) clauses.push(`resource_type = ${bind(filters.resourceType)}`);
        if (filters.actorUserId) clauses.push(`actor_user_id = ${bind(filters.actorUserId)}`);
        if (filters.startDate) clauses.push(`created_at >= ${bind(filters.startDate)}::date`);
        if (filters.endDate) clauses.push(`created_at < (${bind(filters.endDate)}::date + INTERVAL '1 day')`);
        if (filters.q) {
          const q = bind(filters.q);
          clauses.push(
            `POSITION(${q} IN LOWER(CONCAT_WS(' ', id, actor_user_id, organization_id, action, resource_type, resource_id, ip::text, user_agent))) > 0`,
          );
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
        const orderBy = {
          "createdAt:desc": "created_at DESC, id DESC",
          "createdAt:asc": "created_at ASC, id ASC",
          "action:asc": "action ASC, created_at DESC, id DESC",
          "action:desc": "action DESC, created_at DESC, id DESC",
        }[filters.sort];
        const result = await pool.query(
          `SELECT * FROM audit_logs ${where} ORDER BY ${orderBy} LIMIT 50001`,
          parameters,
        );
        return result.rows.map(rowToAuditLog);
      });
      if (exportedLogs.length > 50_000) throw tooLarge();
      return exportedLogs;
    },

    async append(input) {
      const log = createAuditLog(input);
      syncRuntimeAuditLog(log);
      await withSql((pool) => queryInsertAuditLog(pool, log));
      await saveDb();
      return log;
    },
  };

  return {
    auditLogs,
    async hydrateCoreState() {
      const hydrated = await withSql(async (pool) => {
        const [organizationResult, servicePackageResult, userResult, membershipResult, patientResult, patientShareResult, deviceResult, scanResult, audioResult, aiResult, deviceCommandResult, deviceEventResult, notificationDeviceResult, notificationResult, exportResult, auditResult, authSessionResult] = await Promise.all([
          // Keep archived organization rows as runtime tombstones. Operational
          // lookups and lifecycle lists exclude deletedAt, while the tombstone
          // prevents deterministic/catalog ids from being recreated.
          pool.query("SELECT * FROM organizations ORDER BY created_at ASC"),
          pool.query("SELECT * FROM service_packages ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC, id ASC"),
          pool.query("SELECT * FROM users ORDER BY created_at ASC"),
          pool.query("SELECT * FROM memberships ORDER BY created_at ASC"),
          pool.query("SELECT * FROM patients WHERE deleted_at IS NULL ORDER BY updated_at DESC, created_at DESC"),
          pool.query("SELECT * FROM doctor_patient_access ORDER BY created_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM devices ORDER BY updated_at DESC, created_at DESC"),
          pool.query("SELECT * FROM scan_sessions ORDER BY COALESCE(started_at, created_at) DESC LIMIT 500"),
          pool.query("SELECT * FROM audio_files ORDER BY created_at DESC LIMIT 500"),
          pool.query("SELECT * FROM ai_results ORDER BY created_at DESC LIMIT 500"),
          pool.query("SELECT * FROM device_commands ORDER BY issued_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM device_events ORDER BY created_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM notification_devices ORDER BY updated_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200"),
          pool.query("SELECT * FROM exports ORDER BY created_at DESC LIMIT 500"),
          pool.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM auth_sessions ORDER BY last_seen_at DESC LIMIT 500"),
        ]);
        const hydratedState = {
          organizations: organizationResult.rows.map(rowToOrganization),
          servicePackages: servicePackageResult.rows.map(rowToServicePackage),
          users: userResult.rows.map(rowToUser),
          memberships: membershipResult.rows.map(rowToMembership),
          patients: patientResult.rows.map(rowToPatient),
          doctorPatientAccess: patientShareResult.rows.map(rowToPatientShare),
          devices: [],
          scans: scanResult.rows.map(rowToScan),
          audioFiles: audioResult.rows.map(rowToAudioFile),
          aiResults: aiResult.rows.map(rowToAiResult),
          deviceCommands: deviceCommandResult.rows.map(rowToDeviceCommand),
          deviceEvents: deviceEventResult.rows.map(rowToDeviceEvent),
          notificationDevices: notificationDeviceResult.rows.map(rowToNotificationDevice),
          notifications: notificationResult.rows.map(rowToNotification),
          exports: exportResult.rows.map(rowToExport),
          auditLogs: auditResult.rows.map(rowToAuditLog),
          authSessions: authSessionResult.rows.map(rowToAuthSession),
        };
        await repairLegacyDeviceSecretRows(pool, deviceResult.rows);
        hydratedState.devices = deviceResult.rows.map(rowToDevice);
        try {
          const appointmentResult = await pool.query("SELECT * FROM appointments ORDER BY starts_at ASC, created_at DESC LIMIT 500");
          hydratedState.appointments = appointmentResult.rows.map(rowToAppointment);
        } catch (err) {
          onSqlError(err);
        }
        try {
          const chatResult = await pool.query(
            `
              SELECT *
              FROM chat_messages
              WHERE user_id IS NOT NULL AND organization_id IS NOT NULL
              ORDER BY created_at ASC
              LIMIT 500
            `,
          );
          hydratedState.chatMessages = chatResult.rows.map(rowToChatMessage);
        } catch (err) {
          onSqlError(err);
        }
        try {
          const [credentialResult, enrollmentResult, challengeResult, tokenResult] = await Promise.all([
            pool.query("SELECT * FROM two_factor_credentials ORDER BY enabled_at ASC"),
            pool.query("SELECT * FROM two_factor_enrollments ORDER BY created_at ASC LIMIT 500"),
            pool.query("SELECT * FROM two_factor_challenges ORDER BY created_at DESC LIMIT 500"),
            pool.query("SELECT * FROM two_factor_tokens ORDER BY created_at DESC LIMIT 500"),
          ]);
          hydratedState.twoFactorCredentials = credentialResult.rows.map(rowToTwoFactorCredential);
          hydratedState.twoFactorEnrollments = enrollmentResult.rows.map(rowToTwoFactorEnrollment);
          hydratedState.twoFactorChallenges = challengeResult.rows.map(rowToTwoFactorChallenge);
          hydratedState.twoFactorTokens = tokenResult.rows.map(rowToTwoFactorToken);
        } catch (err) {
          onSqlError(err);
        }
        return hydratedState;
      });

      if (!hydrated) {
        return null;
      }

      const db = getDb();
      const counts = {};
      for (const key of ["organizations", "servicePackages", "users", "memberships", "patients", "appointments", "doctorPatientAccess", "devices", "scans", "audioFiles", "aiResults", "deviceCommands", "deviceEvents", "notificationDevices", "notifications", "exports", "auditLogs", "authSessions", "chatMessages", "twoFactorCredentials", "twoFactorEnrollments", "twoFactorChallenges", "twoFactorTokens"]) {
        if (!Array.isArray(hydrated[key])) {
          continue;
        }
        const items = hydrated[key].filter(Boolean);
        counts[key] = items.length;
        // Normalized SQL rows stay authoritative for queryable collections.
        // Keep forward-compatible runtime metadata only for rows that still
        // exist in SQL; an empty SQL table must clear stale runtime rows.
        const runtimeItems = new Map((db[key] || []).map((item) => [item.id, item]));
        db[key] = items.map((item) => ({ ...runtimeItems.get(item.id), ...item }));
      }
      const clinicalCounts = await clinicalWorkflow.hydrate();
      Object.assign(counts, clinicalCounts);
      const scanAudioCounts = await scanAudioUploads.hydrate();
      Object.assign(counts, scanAudioCounts);
      const storageMetadataCounts = await storageMetadata.hydrate();
      Object.assign(counts, storageMetadataCounts);
      const staffInvitationCounts = await staffInvitations.hydrate();
      Object.assign(counts, staffInvitationCounts);
      const activeCredentials = new Map(
        (db.twoFactorCredentials || [])
          .filter((credential) => credential && !credential.disabledAt)
          .map((credential) => [credential.userId, credential]),
      );
      for (const user of db.users) {
        const credential = activeCredentials.get(user.id);
        user.twoFactorEnabled = Boolean(credential);
        user.twoFactorMethod = credential ? credential.method || "app" : "";
        delete user.twoFactorSecret;
        delete user.twoFactorSecretPreview;
        delete user.twoFactorRecoveryCodes;
        user.firebaseClaims = sanitizeTwoFactorClaims(user.firebaseClaims);
      }
      return counts;
    },
    memberships,
    servicePackages,
    clinicalAlerts: clinicalWorkflow.alerts,
    clinicalReviews: clinicalWorkflow.reviews,
    scanAudioUploads,
    storageMetadata,
    staffInvitations,
    workspaceLifecycle,
    authSessions,
    identityOperations,
    notifications,
    exports,
    patients,
    patientImports,
    appointments,
    patientShares,
    devices,
    scans,
    audioFiles,
    aiResults,
    audioProcessing,
    deviceCommands,
    deviceEvents,
    notificationDevices,
    chatMessages,
    twoFactor,
    organizations,
    users,
  };
}

module.exports = {
  createRepositories,
};
