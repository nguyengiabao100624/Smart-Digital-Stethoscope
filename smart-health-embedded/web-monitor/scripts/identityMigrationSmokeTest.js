const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  EXPORT_ARTIFACT_RENDERER_VERSION,
  buildExportArtifact,
} = require("../src/exportArtifact");
const {
  applyOrganizationOwner,
  createImportCounter,
  insertExportJob,
  insertPatientImportBatch,
  insertStaffInvitation,
  normalizeLegacyPatientIdentityGraph,
  recordImportOutcome,
  runMigrations,
  upsertAiResult,
  upsertAudioFile,
  upsertClinicalAlert,
  upsertDevice,
  upsertDeviceClaim,
  upsertDoctorPatientAccess,
  upsertMembership,
  upsertNotification,
  upsertOrganization,
  upsertPatient,
  upsertScan,
  upsertScanAudioChunk,
  upsertScanAudioCompletion,
  upsertScanReview,
  upsertUser,
  validateAndNormalizeImportGraph,
} = require("./migrateJsonToPostgres");

function baseGraph(overrides = {}) {
  return {
    organizations: [{ id: "org_identity", name: "Identity Clinic", type: "clinic" }],
    users: [{
      id: "user_patient",
      role: "patient",
      patientId: "patient_self",
      organizationId: "org_identity",
    }],
    patients: [{
      id: "patient_self",
      organizationId: "org_identity",
      ownerUserId: "",
      accountUserId: "",
      profileType: "patient",
    }],
    ...overrides,
  };
}

async function main() {
  const sameTenant = baseGraph();
  normalizeLegacyPatientIdentityGraph(sameTenant);
  assert.equal(sameTenant.patients[0].ownerUserId, "user_patient");
  assert.equal(sameTenant.patients[0].accountUserId, "user_patient");
  assert.equal(sameTenant.patients[0].profileType, "self");

  const nullTenant = baseGraph({
    users: [{ id: "user_null", role: "patient", patientId: "patient_null", organizationId: "" }],
    patients: [{ id: "patient_null", organizationId: "", ownerUserId: "", accountUserId: "" }],
  });
  normalizeLegacyPatientIdentityGraph(nullTenant);
  assert.equal(nullTenant.users[0].organizationId, "");
  assert.equal(nullTenant.patients[0].organizationId, "");
  assert.equal(nullTenant.patients[0].accountUserId, "user_null");

  const doctorLegacyIdentity = baseGraph({
    users: [{
      id: "user_doctor_identity",
      role: "doctor",
      patientId: "patient_doctor_identity",
      organizationId: "org_identity",
    }],
    patients: [{
      id: "patient_doctor_identity",
      organizationId: "org_identity",
      ownerUserId: "",
      accountUserId: "",
      profileType: "patient",
    }],
  });
  normalizeLegacyPatientIdentityGraph(doctorLegacyIdentity);
  assert.equal(doctorLegacyIdentity.patients[0].accountUserId, "user_doctor_identity");
  assert.equal(doctorLegacyIdentity.patients[0].ownerUserId, "user_doctor_identity");
  assert.equal(doctorLegacyIdentity.patients[0].profileType, "self");

  const doctorExplicitAccount = baseGraph({
    users: [{
      id: "user_doctor_account",
      role: "doctor",
      organizationId: "org_identity",
    }],
    patients: [{
      id: "patient_doctor_account",
      organizationId: "org_identity",
      ownerUserId: "user_doctor_account",
      accountUserId: "user_doctor_account",
      profileType: "self",
    }],
  });
  normalizeLegacyPatientIdentityGraph(doctorExplicitAccount);
  assert.equal(doctorExplicitAccount.users[0].patientId, "patient_doctor_account");

  const ownerOnlyNullTenant = baseGraph({
    users: [{ id: "user_guardian", role: "patient", organizationId: "" }],
    patients: [{
      id: "patient_dependent",
      organizationId: "",
      ownerUserId: "user_guardian",
      accountUserId: "",
      profileType: "patient",
    }],
  });
  normalizeLegacyPatientIdentityGraph(ownerOnlyNullTenant);
  assert.equal(ownerOnlyNullTenant.patients[0].organizationId, "");
  assert.equal(ownerOnlyNullTenant.patients[0].ownerUserId, "user_guardian");
  assert.equal(ownerOnlyNullTenant.patients[0].accountUserId || "", "");
  assert.equal(ownerOnlyNullTenant.patients[0].profileType, "dependent");
  assert.equal(ownerOnlyNullTenant.patients[0].relationship, "dependent");
  assert.equal(ownerOnlyNullTenant.users[0].patientId || "", "");

  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      organizations: [
        { id: "org_identity", name: "A" },
        { id: "org_other", name: "B" },
      ],
      patients: [{ id: "patient_self", organizationId: "org_other" }],
    })),
    (error) => error.code === "LEGACY_PATIENT_TENANT_MISMATCH",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      users: [{ id: "user_patient", role: "patient", patientId: "patient_self", organizationId: "" }],
    })),
    (error) => error.code === "LEGACY_PATIENT_TENANT_MISMATCH",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      users: [
        { id: "user_patient", role: "patient", patientId: "patient_self", organizationId: "org_identity" },
        { id: "user_patient_two", role: "patient", patientId: "patient_self", organizationId: "org_identity" },
      ],
    })),
    (error) => error.code === "LEGACY_PATIENT_LINK_AMBIGUOUS",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      users: [
        { id: "user_doctor_one", role: "doctor", patientId: "patient_self", organizationId: "org_identity" },
        { id: "user_doctor_two", role: "doctor", patientId: "patient_self", organizationId: "org_identity" },
      ],
    })),
    (error) => error.code === "LEGACY_PATIENT_LINK_AMBIGUOUS",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      patients: [{
        id: "patient_self",
        organizationId: "org_identity",
        ownerUserId: "user_other",
      }],
    })),
    (error) => error.code === "LEGACY_PATIENT_OWNERSHIP_CONFLICT",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      patients: [{ id: "patient_self", organizationId: "org_identity", deletedAt: "2026-07-01T00:00:00.000Z" }],
    })),
    (error) => error.code === "LEGACY_PATIENT_LINK_DELETED",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      users: [{ id: "user_patient", role: "patient", organizationId: "org_identity" }],
      patients: [
        { id: "patient_one", organizationId: "org_identity", accountUserId: "user_patient", ownerUserId: "user_patient" },
        { id: "patient_two", organizationId: "org_identity", accountUserId: "user_patient", ownerUserId: "user_patient" },
      ],
    })),
    (error) => error.code === "PATIENT_ACCOUNT_DUPLICATE",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      users: [{
        id: "user_doctor_conflict",
        role: "doctor",
        patientId: "patient_other",
        organizationId: "org_identity",
      }],
      patients: [
        {
          id: "patient_self",
          organizationId: "org_identity",
          accountUserId: "user_doctor_conflict",
          ownerUserId: "user_doctor_conflict",
          profileType: "self",
        },
        { id: "patient_other", organizationId: "org_identity" },
      ],
    })),
    (error) => error.code === "PATIENT_ACCOUNT_INVERSE_CONFLICT",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      users: [],
      patients: [{
        id: "patient_role_conflict",
        organizationId: "org_identity",
        accountUserId: "user_missing",
        ownerUserId: "user_missing",
      }],
    })),
    (error) => error.code === "PATIENT_ACCOUNT_USER_MISSING",
  );
  assert.throws(
    () => normalizeLegacyPatientIdentityGraph(baseGraph({
      users: [{ id: "user_patient", role: "patient", organizationId: "org_identity" }],
      patients: [{ id: "patient_self_missing_account", organizationId: "org_identity", profileType: "self" }],
    })),
    (error) => error.code === "PATIENT_SELF_ACCOUNT_REQUIRED",
  );

  const patientWrites = [];
  const patientSource = {
    id: "patient_imported",
    organizationId: "org_identity",
    ownerUserId: "user_patient",
    accountUserId: "user_patient",
    patientCode: "P-001",
    name: "Imported Patient",
    dateOfBirth: "1990-01-02",
    allergies: ["penicillin"],
    emergencyContact: { name: "Relative" },
    profileType: "self",
    relationship: "self",
    updatedAt: "2026-07-14T00:00:00.000Z",
  };
  const insertedPatient = await upsertPatient({
    async query(sql, params) {
      patientWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: "patient_imported", updated_at: patientSource.updatedAt }] };
    },
  }, patientSource);
  assert.equal(insertedPatient.state, "inserted");
  const patientInsert = patientWrites.find((write) => /INSERT\s+INTO\s+patients/i.test(write.sql));
  assert.match(patientInsert.sql, /account_user_id/i);
  assert.match(patientInsert.sql, /profile_type/i);
  assert.match(patientInsert.sql, /date_of_birth/i);
  assert.match(patientInsert.sql, /ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i);
  assert.doesNotMatch(patientInsert.sql, /DO\s+UPDATE/i);
  assert.equal(patientInsert.params.length, 25);
  assert.equal(patientInsert.params[3], "user_patient");
  assert.equal(patientInsert.params[16], "self");
  assert.equal(patientInsert.params[17], "self");

  let stalePatientQueries = 0;
  const stalePatient = await upsertPatient({
    async query() {
      stalePatientQueries += 1;
      return {
        rowCount: 1,
        rows: [{
          id: "patient_imported",
          organization_id: "org_identity",
          owner_user_id: "user_patient",
          account_user_id: "user_patient",
          updated_at: "2026-07-15T00:00:00.000Z",
        }],
      };
    },
  }, patientSource);
  assert.equal(stalePatient.state, "preserved");
  assert.equal(stalePatientQueries, 1, "stale patient PHI must not issue an UPDATE");

  const newerPatientWrites = [];
  const newerPatient = await upsertPatient({
    async query(sql, params) {
      newerPatientWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: "patient_imported",
            organization_id: "org_identity",
            owner_user_id: "user_patient",
            account_user_id: "user_patient",
            updated_at: "2026-07-13T00:00:00.000Z",
          }],
        };
      }
      return { rowCount: 1, rows: [{ id: "patient_imported", updated_at: params[24] }] };
    },
  }, patientSource);
  assert.equal(newerPatient.state, "updated");
  const patientUpdate = newerPatientWrites.find((write) => /^\s*UPDATE\s+patients/i.test(write.sql));
  assert.match(patientUpdate.sql, /COALESCE\(updated_at,\s*'-infinity'::timestamptz\)\s*<\s*\$25::timestamptz/i);
  assert.match(patientUpdate.sql, /AND\s+\$31::boolean/i);
  assert.match(patientUpdate.sql, /deleted_at\s*=\s*COALESCE\(deleted_at,\s*\$23::timestamptz\)/i);
  assert.deepEqual(patientUpdate.params.slice(25), [true, true, true, true, true, true]);

  const partialWrites = [];
  const partialPatient = await upsertPatient({
    async query(sql, params) {
      partialWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: "patient_partial" }] };
    },
  }, { id: "patient_partial" });
  assert.equal(partialPatient.state, "inserted");
  const partialInsert = partialWrites.find((write) => /INSERT\s+INTO\s+patients/i.test(write.sql));
  assert.equal(partialInsert.params[22], null, "a partial import must not explicitly revive a soft-deleted patient");
  await assert.rejects(
    upsertPatient({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            id: "patient_conflict",
            organization_id: "org_other",
            owner_user_id: null,
            account_user_id: null,
            updated_at: "2026-07-15T00:00:00.000Z",
          }],
        };
      },
    }, { id: "patient_conflict", organizationId: "org_identity", name: "Conflicting patient" }),
    (error) =>
      error.code === "PATIENT_IMPORT_CANONICAL_CONFLICT" &&
      error.details.mismatchFields.includes("organizationId"),
  );

  const userWrites = [];
  const insertedUser = await upsertUser({
    async query(sql, params) {
      userWrites.push({ sql, params });
      if (/FROM\s+users[\s\S]*FOR UPDATE/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "user_existing",
    firebaseUid: "stale-firebase-uid",
    email: "stale@example.test",
    role: "admin",
    organizationId: "org_other",
    accountStatus: "active",
    firebaseClaims: { admin: true },
  });
  assert.equal(insertedUser.state, "inserted");
  const membershipWrites = [];
  const insertedMembership = await upsertMembership({
    async query(sql, params) {
      membershipWrites.push({ sql, params });
      if (/FROM\s+users[\s\S]*FOR SHARE/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: params[0],
            role: "workspace_owner",
            account_status: "active",
            role_request_status: "approved",
          }],
        };
      }
      if (/FROM\s+organizations[\s\S]*FOR SHARE/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: params[0], status: "active", workspace_type: "clinic", type: "clinic" }] };
      }
      if (/FROM\s+memberships/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "membership_existing",
    organizationId: "org_identity",
    userId: "user_existing",
    role: "workspace_owner",
    status: "suspended",
    suspendedAt: "2026-06-20T08:00:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
  });
  assert.equal(insertedMembership.state, "inserted");
  const shareWrites = [];
  const insertedShare = await upsertDoctorPatientAccess({
    async query(sql, params) {
      shareWrites.push({ sql, params });
      if (/AS\s+authority_valid/i.test(sql)) {
        return { rowCount: 1, rows: [{ authority_valid: true }] };
      }
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "share_existing",
    doctorUserId: "user_doctor",
    doctorId: "user_doctor",
    patientId: "patient_self",
    accessLevel: "write",
    scope: "patient_profile",
  });
  assert.equal(insertedShare.state, "inserted");
  const userInsertSql = userWrites.find((write) => /INSERT\s+INTO\s+users/i.test(write.sql)).sql;
  const membershipInsertSql = membershipWrites.find((write) => /INSERT\s+INTO\s+memberships/i.test(write.sql)).sql;
  const membershipInsert = membershipWrites.find((write) => /INSERT\s+INTO\s+memberships/i.test(write.sql));
  const shareAuthoritySql = shareWrites.find((write) => /AS\s+authority_valid/i.test(write.sql)).sql;
  const shareInsertSql = shareWrites.find((write) => /INSERT\s+INTO\s+doctor_patient_access/i.test(write.sql)).sql;
  assert.match(userInsertSql, /ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i);
  assert.doesNotMatch(userInsertSql, /role\s*=\s*EXCLUDED\.role/i);
  assert.doesNotMatch(userInsertSql, /account_status\s*=\s*EXCLUDED\.account_status/i);
  assert.doesNotMatch(userInsertSql, /firebase_claims\s*=\s*EXCLUDED\.firebase_claims/i);
  assert.match(membershipInsertSql, /ON\s+CONFLICT\s*\(organization_id,\s*user_id\)\s+DO\s+NOTHING/i);
  assert.match(membershipInsertSql, /status,\s*suspended_at,\s*created_at,\s*updated_at/i);
  assert.doesNotMatch(membershipInsertSql, /role\s*=\s*EXCLUDED\.role/i);
  assert.equal(membershipInsert.params[4], "suspended");
  assert.equal(membershipInsert.params[5], "2026-06-20T08:00:00.000Z");
  assert.match(
    shareAuthoritySql,
    /COALESCE\s*\(\s*doctor_membership\.status,\s*'active'\s*\)\s*=\s*'active'/i,
  );
  assert.doesNotMatch(
    shareAuthoritySql,
    /doctor_account\.organization_id\s*=\s*doctor_organization\.id/i,
    "a doctor may receive access through any active doctor membership, not only the account default workspace",
  );
  assert.match(shareInsertSql, /ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i);
  assert.doesNotMatch(shareInsertSql, /doctor_user_id\s*=\s*EXCLUDED\.doctor_user_id/i);

  let attemptedMembershipReactivation = false;
  const preservedSuspendedMembership = await upsertMembership({
    async query(sql) {
      if (/FROM\s+users/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: "doctor_suspended",
            role: "doctor",
            account_status: "active",
            role_request_status: "approved",
          }],
        };
      }
      if (/FROM\s+organizations/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: "org_identity", status: "active", workspace_type: "clinic" }] };
      }
      if (/FROM\s+memberships/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: "membership_suspended",
            organization_id: "org_identity",
            user_id: "doctor_suspended",
            role: "doctor",
            status: "suspended",
            suspended_at: "2026-06-20T08:00:00.000Z",
          }],
        };
      }
      if (/UPDATE\s+memberships/i.test(sql)) {
        attemptedMembershipReactivation = true;
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected suspended-membership query: ${sql}`);
    },
  }, {
    id: "membership_stale_active",
    organizationId: "org_identity",
    userId: "doctor_suspended",
    role: "doctor",
    status: "active",
  });
  assert.equal(preservedSuspendedMembership.state, "preserved");
  assert.equal(
    attemptedMembershipReactivation,
    false,
    "a stale JSON import must never reactivate a canonical suspended membership",
  );

  let suspensionWrite = null;
  const narrowedActiveMembership = await upsertMembership({
    async query(sql, params) {
      if (/FROM\s+users/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: "doctor_to_suspend",
            role: "doctor",
            account_status: "active",
            role_request_status: "approved",
          }],
        };
      }
      if (/FROM\s+organizations/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: "org_identity", status: "active", workspace_type: "clinic" }] };
      }
      if (/FROM\s+memberships/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: "membership_active",
            organization_id: "org_identity",
            user_id: "doctor_to_suspend",
            role: "doctor",
            status: "active",
          }],
        };
      }
      if (/UPDATE\s+memberships/i.test(sql)) {
        suspensionWrite = { sql, params };
        return {
          rowCount: 1,
          rows: [{
            id: params[0],
            organization_id: "org_identity",
            user_id: "doctor_to_suspend",
            role: "doctor",
            status: "suspended",
            suspended_at: params[1],
            updated_at: params[2],
          }],
        };
      }
      throw new Error(`Unexpected membership-suspension query: ${sql}`);
    },
  }, {
    id: "membership_source_suspended",
    organizationId: "org_identity",
    userId: "doctor_to_suspend",
    role: "doctor",
    status: "suspended",
    suspendedAt: "2026-06-20T09:00:00.000Z",
    updatedAt: "2026-06-20T09:00:00.000Z",
  });
  assert.equal(narrowedActiveMembership.state, "updated");
  assert.match(suspensionWrite.sql, /SET[\s\S]*status\s*=\s*'suspended'/i);
  assert.equal(suspensionWrite.params[1], "2026-06-20T09:00:00.000Z");

  const canonicalUserRow = {
    id: "user_canonical",
    firebase_uid: "firebase-canonical",
    email: "canonical@example.test",
    phone: "0900000000",
    role: "doctor",
    organization_id: "org_identity",
    patient_id: null,
    account_status: "active",
    requested_role: "doctor",
    role_request_status: "approved",
    verified_email: true,
    verified_phone: false,
    firebase_claims: { role: "doctor", organizationId: "org_identity" },
  };
  const canonicalUserInput = {
    id: "user_canonical",
    firebaseUid: "firebase-canonical",
    email: "canonical@example.test",
    phone: "0900000000",
    role: "doctor",
    organizationId: "org_identity",
    accountStatus: "active",
    requestedRole: "doctor",
    roleRequestStatus: "approved",
    verifiedEmail: true,
    firebaseClaims: { organizationId: "org_identity", role: "doctor" },
  };
  let canonicalUserQueries = 0;
  const preservedUser = await upsertUser({
    async query() {
      canonicalUserQueries += 1;
      return { rowCount: 1, rows: [canonicalUserRow] };
    },
  }, canonicalUserInput);
  assert.equal(preservedUser.state, "preserved");
  assert.equal(canonicalUserQueries, 1, "an exact canonical user must not be rewritten");
  await assert.rejects(
    upsertUser({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            ...canonicalUserRow,
            firebase_uid: "firebase-other",
            role: "patient",
            organization_id: "org_other",
            account_status: "locked",
          }],
        };
      },
    }, canonicalUserInput),
    (error) =>
      error.code === "IMPORT_USER_CANONICAL_CONFLICT" &&
      ["firebaseUid", "role", "organizationId", "accountStatus"]
        .every((field) => error.details.mismatchFields.includes(field)),
  );

  await assert.rejects(
    upsertMembership({
      async query(sql) {
        if (/FROM\s+users/i.test(sql)) {
          return { rowCount: 1, rows: [{ id: "user_patient", role: "patient", account_status: "active" }] };
        }
        return { rowCount: 0, rows: [] };
      },
    }, {
      id: "membership_privilege_escalation",
      organizationId: "org_identity",
      userId: "user_patient",
      role: "workspace_owner",
    }),
    (error) => error.code === "IMPORT_MEMBERSHIP_CANONICAL_ROLE_CONFLICT",
  );
  await assert.rejects(
    upsertMembership({
      async query(sql) {
        if (/FROM\s+users/i.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              id: "user_doctor",
              role: "doctor",
              account_status: "active",
              role_request_status: "approved",
            }],
          };
        }
        if (/FROM\s+organizations/i.test(sql)) {
          return { rowCount: 1, rows: [{ id: "org_identity", status: "active", workspace_type: "clinic" }] };
        }
        return {
          rowCount: 1,
          rows: [{ id: "membership_live", organization_id: "org_identity", user_id: "user_doctor", role: "viewer" }],
        };
      },
    }, {
      id: "membership_stale",
      organizationId: "org_identity",
      userId: "user_doctor",
      role: "doctor",
    }),
    (error) => error.code === "IMPORT_MEMBERSHIP_CANONICAL_CONFLICT",
  );

  await assert.rejects(
    upsertMembership({
      async query(sql) {
        if (/FROM\s+users/i.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              id: "doctor_pending",
              role: "doctor",
              account_status: "active",
              role_request_status: "pending",
            }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    }, {
      id: "membership_pending_doctor",
      organizationId: "org_identity",
      userId: "doctor_pending",
      role: "doctor",
    }),
    (error) => error.code === "IMPORT_MEMBERSHIP_CANONICAL_APPROVAL_REQUIRED",
  );

  await assert.rejects(
    upsertMembership({
      async query(sql) {
        if (/FROM\s+users/i.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              id: "doctor_approved",
              role: "doctor",
              account_status: "active",
              role_request_status: "approved",
            }],
          };
        }
        if (/FROM\s+organizations/i.test(sql)) {
          return { rowCount: 1, rows: [{ id: "org_pending", status: "pending", workspace_type: "clinic" }] };
        }
        return { rowCount: 0, rows: [] };
      },
    }, {
      id: "membership_pending_workspace",
      organizationId: "org_pending",
      userId: "doctor_approved",
      role: "doctor",
    }),
    (error) => error.code === "IMPORT_MEMBERSHIP_CANONICAL_WORKSPACE_INVALID",
  );

  const canonicalAliasGraph = {
    organizations: [{
      id: "org_identity",
      status: "active",
      workspaceType: "clinic",
      ownerUserId: "user_owner",
    }],
    users: [{
      id: "user_doctor",
      firebaseUid: "firebase-doctor",
      role: "doctor",
      requestedRole: "doctor",
      roleRequestStatus: "approved",
      accountStatus: "active",
      organizationId: "org_identity",
    }, {
      id: "user_owner",
      role: "workspace_owner",
      requestedRole: "workspace_owner",
      roleRequestStatus: "approved",
      accountStatus: "active",
      organizationId: "org_identity",
    }],
    memberships: [{
      id: "membership_doctor",
      userId: "user_doctor",
      organizationId: "org_identity",
      role: "doctor",
    }, {
      id: "membership_owner",
      userId: "user_owner",
      organizationId: "org_identity",
      role: "workspace_owner",
    }],
    patients: [{
      id: "patient_shared",
      organizationId: "org_identity",
      ownerUserId: "user_doctor",
    }],
    doctorPatientAccess: [{
      id: "share_alias",
      doctorUserId: "firebase-doctor",
      patientId: "patient_shared",
      grantedByUserId: "user_doctor",
      scope: "patient_profile",
    }],
  };
  validateAndNormalizeImportGraph(canonicalAliasGraph);
  assert.equal(canonicalAliasGraph.doctorPatientAccess[0].doctorUserId, "user_doctor");
  assert.equal(canonicalAliasGraph.doctorPatientAccess[0].doctorId, "user_doctor");
  assert.equal(
    canonicalAliasGraph.doctorPatientAccess[0].authorityType,
    "clinician_access_grant",
    "a non-patient grantor must not be relabeled as patient consent even when it owns the profile",
  );
  assert.equal(canonicalAliasGraph.doctorPatientAccess[0].consentedAt, "");

  let unresolvedGraphError = null;
  try {
    validateAndNormalizeImportGraph({
      organizations: [{ id: "org_identity", status: "pending" }],
      users: [],
      patients: [{ id: "patient_shared", organizationId: "org_identity" }],
      doctorPatientAccess: [{
        id: "share_unresolved",
        doctorUserId: "missing-doctor-alias",
        organizationId: "org_identity",
        patientId: "patient_shared",
      }],
    });
  } catch (error) {
    unresolvedGraphError = error;
  }
  assert.equal(unresolvedGraphError?.code, "IMPORT_REFERENCE_VALIDATION_FAILED");
  assert.ok(
    unresolvedGraphError.details.issues.some((issue) =>
      issue.code === "IMPORT_REFERENCE_MISSING" && issue.referencedId === "missing-doctor-alias"),
    "an unresolved doctor alias must fail instead of becoming workspace-wide access",
  );

  let aggregateReferenceError = null;
  try {
    validateAndNormalizeImportGraph({
      organizations: [{ id: "org_identity", status: "pending" }],
      users: [],
      patients: [],
      scans: [{ id: "scan_missing", patientId: "patient_missing", deviceId: "device_missing" }],
      audioFiles: [{ id: "audio_missing", scanId: "scan_other", patientId: "patient_other" }],
      aiResults: [{ id: "ai_missing", scanId: "scan_other" }],
    });
  } catch (error) {
    aggregateReferenceError = error;
  }
  assert.equal(aggregateReferenceError?.code, "IMPORT_REFERENCE_VALIDATION_FAILED");
  assert.ok(aggregateReferenceError.details.issueCount >= 5, "all missing references must be aggregated");
  assert.ok(aggregateReferenceError.details.issues.some((issue) => issue.entityType === "scan"));
  assert.ok(aggregateReferenceError.details.issues.some((issue) => issue.entityType === "audio_file"));
  assert.ok(aggregateReferenceError.details.issues.some((issue) => issue.entityType === "ai_result"));

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{ id: "org_ownerless", type: "clinic", status: "active" }],
      users: [],
      memberships: [],
    }),
    (error) =>
      error.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some((issue) => issue.code === "IMPORT_ACTIVE_WORKSPACE_OWNER_REQUIRED"),
  );

  const ownerGraph = {
    organizations: [{ id: "org_owned", ownerUserId: "user_owner" }],
    users: [{
      id: "user_owner",
      role: "workspace_owner",
      requestedRole: "workspace_owner",
      roleRequestStatus: "approved",
      organizationId: "org_owned",
      accountStatus: "active",
    }],
    memberships: [{
      id: "membership_owner",
      organizationId: "org_owned",
      userId: "user_owner",
      role: "workspace_owner",
    }],
  };
  validateAndNormalizeImportGraph(ownerGraph);

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{
        id: "org_suspended_doctor",
        ownerUserId: "owner_suspended_doctor",
        status: "active",
        workspaceType: "clinic",
      }],
      users: [{
        id: "owner_suspended_doctor",
        role: "workspace_owner",
        requestedRole: "workspace_owner",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_suspended_doctor",
      }, {
        id: "doctor_suspended_share",
        role: "doctor",
        requestedRole: "doctor",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_suspended_doctor",
      }],
      memberships: [{
        id: "membership_suspended_doctor_owner",
        organizationId: "org_suspended_doctor",
        userId: "owner_suspended_doctor",
        role: "workspace_owner",
        status: "active",
      }, {
        id: "membership_suspended_doctor_share",
        organizationId: "org_suspended_doctor",
        userId: "doctor_suspended_share",
        role: "doctor",
        status: "suspended",
      }],
      patients: [{
        id: "patient_suspended_doctor_share",
        organizationId: "org_suspended_doctor",
      }],
      doctorPatientAccess: [{
        id: "share_suspended_doctor",
        doctorUserId: "doctor_suspended_share",
        patientId: "patient_suspended_doctor_share",
        scope: "patient_profile",
      }],
    }),
    (error) =>
      error?.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some((issue) => issue.code === "IMPORT_SHARE_DOCTOR_AUTHORITY_INVALID"),
  );

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{ id: "org_pending_clinic", status: "pending", workspaceType: "clinic" }],
      users: [{
        id: "doctor_pending",
        role: "doctor",
        requestedRole: "doctor",
        roleRequestStatus: "pending",
        accountStatus: "active",
        organizationId: "org_pending_clinic",
      }],
      memberships: [{
        id: "membership_pending_doctor",
        organizationId: "org_pending_clinic",
        userId: "doctor_pending",
        role: "doctor",
      }],
      patients: [{ id: "patient_pending_share", organizationId: "org_pending_clinic" }],
      doctorPatientAccess: [{
        id: "share_pending_doctor",
        doctorUserId: "doctor_pending",
        patientId: "patient_pending_share",
        scope: "patient_profile",
      }],
    }),
    (error) => {
      if (error?.code !== "IMPORT_REFERENCE_VALIDATION_FAILED") return false;
      const codes = new Set(error.details.issues.map((issue) => issue.code));
      return codes.has("IMPORT_MEMBERSHIP_APPROVAL_REQUIRED") &&
        codes.has("IMPORT_MEMBERSHIP_ACTIVE_WORKSPACE_REQUIRED") &&
        codes.has("IMPORT_SHARE_DOCTOR_AUTHORITY_INVALID");
    },
  );

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [
        { id: "org_notification_a", status: "pending", workspaceType: "clinic" },
        { id: "org_notification_b", status: "pending", workspaceType: "clinic" },
      ],
      users: [{
        id: "user_notification_b",
        role: "patient",
        accountStatus: "active",
        organizationId: "org_notification_b",
      }],
      memberships: [{
        id: "membership_notification_b",
        organizationId: "org_notification_b",
        userId: "user_notification_b",
        role: "patient",
      }],
      notifications: [{
        id: "notification_cross_tenant",
        organizationId: "org_notification_a",
        userId: "user_notification_b",
        title: "Private clinical update",
        message: "Must not cross tenants",
      }],
    }),
    (error) =>
      error?.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some((issue) => issue.code === "IMPORT_NOTIFICATION_AUDIENCE_TENANT_MISMATCH"),
  );

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{ id: "org_notification_suspended", status: "pending", workspaceType: "clinic" }],
      users: [{
        id: "user_notification_suspended",
        role: "patient",
        accountStatus: "active",
        organizationId: "org_notification_suspended",
      }],
      memberships: [{
        id: "membership_notification_suspended",
        organizationId: "org_notification_suspended",
        userId: "user_notification_suspended",
        role: "patient",
        status: "suspended",
      }],
      notifications: [{
        id: "notification_suspended_member",
        organizationId: "org_notification_suspended",
        userId: "user_notification_suspended",
        title: "Private clinical update",
        message: "Suspended members must not receive workspace notifications",
      }],
    }),
    (error) =>
      error?.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some((issue) => issue.code === "IMPORT_NOTIFICATION_AUDIENCE_TENANT_MISMATCH"),
  );

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{ id: "org_owned", ownerUserId: "user_owner" }],
      users: [{ id: "user_owner", role: "workspace_owner", organizationId: "org_owned" }],
      memberships: [],
    }),
    (error) =>
      error.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some((issue) => issue.code === "IMPORT_WORKSPACE_OWNER_MEMBERSHIP_REQUIRED"),
  );

  const organizationWrites = [];
  const insertedOrganization = await upsertOrganization({
    async query(sql, params) {
      organizationWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "org_new_pending",
    name: "Pending Clinic",
    type: "clinic",
    workspaceType: "clinic",
    status: "pending",
  });
  assert.equal(insertedOrganization.state, "inserted");
  const organizationInsertSql = organizationWrites.find((write) => /INSERT\s+INTO\s+organizations/i.test(write.sql)).sql;
  assert.match(organizationInsertSql, /workspace_type,\s*status/i);
  assert.match(organizationInsertSql, /ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i);
  await assert.rejects(
    upsertOrganization({
      async query() {
        return { rowCount: 1, rows: [{ id: "org_live", type: "clinic", workspace_type: "clinic", status: "inactive" }] };
      },
    }, { id: "org_live", type: "clinic", workspaceType: "clinic", status: "active" }),
    (error) =>
      error.code === "IMPORT_WORKSPACE_CANONICAL_CONFLICT" &&
      error.details.mismatchFields.includes("status"),
  );

  const ownerWrites = [];
  const appliedOwner = await applyOrganizationOwner({
    async query(sql, params) {
      ownerWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ id: params[0], owner_user_id: null, status: "active", owner_valid: true }],
        };
      }
      return { rowCount: 1, rows: [{ id: params[0], owner_user_id: params[1] }] };
    },
  }, ownerGraph.organizations[0]);
  assert.equal(appliedOwner.state, "updated");
  assert.match(ownerWrites[0].sql, /organization\.status/i);
  assert.match(ownerWrites[0].sql, /owner_account\.account_status\s*=\s*'active'/i);
  assert.match(ownerWrites[0].sql, /owner_membership\.role\s+IN\s*\('owner',\s*'workspace_owner'\)/i);
  assert.match(
    ownerWrites[0].sql,
    /COALESCE\s*\(\s*owner_membership\.status,\s*'active'\s*\)\s*=\s*'active'/i,
  );
  assert.match(ownerWrites[1].sql, /owner_user_id\s*=\s*\$2/i);
  assert.match(ownerWrites[1].sql, /owner_user_id\s+IS\s+NULL\s+AND\s+status\s*=\s*'active'/i);
  await assert.rejects(
    applyOrganizationOwner({
      async query() {
        return {
          rowCount: 1,
          rows: [{ id: "org_owned", owner_user_id: "user_other", status: "active", owner_valid: true }],
        };
      },
    }, ownerGraph.organizations[0]),
    (error) => error.code === "IMPORT_WORKSPACE_OWNER_CANONICAL_CONFLICT",
  );
  await assert.rejects(
    applyOrganizationOwner({
      async query() {
        return {
          rowCount: 1,
          rows: [{ id: "org_owned", owner_user_id: null, status: "pending", owner_valid: true }],
        };
      },
    }, ownerGraph.organizations[0]),
    (error) => error.code === "IMPORT_WORKSPACE_OWNER_STATUS_INVALID",
  );

  let tenantGraphError = null;
  try {
    validateAndNormalizeImportGraph({
      organizations: [
        { id: "org_scan", type: "clinic", status: "pending" },
        { id: "org_other", type: "clinic", status: "pending" },
      ],
      users: [
        { id: "user_other", role: "viewer", organizationId: "org_other" },
      ],
      patients: [{ id: "patient_other", organizationId: "org_other" }],
      devices: [{ id: "device_scan", organizationId: "org_scan", pairedUserId: "user_other" }],
      scans: [{
        id: "scan_tenant_mismatch",
        organizationId: "org_scan",
        patientId: "patient_other",
        deviceId: "device_scan",
        createdByUserId: "user_other",
      }],
    });
  } catch (error) {
    tenantGraphError = error;
  }
  assert.equal(tenantGraphError?.code, "IMPORT_REFERENCE_VALIDATION_FAILED");
  const tenantIssueCodes = new Set(tenantGraphError.details.issues.map((issue) => issue.code));
  assert.equal(tenantIssueCodes.has("IMPORT_DEVICE_TENANT_MISMATCH"), true);
  assert.equal(tenantIssueCodes.has("IMPORT_SCAN_PATIENT_TENANT_MISMATCH"), true);
  assert.equal(tenantIssueCodes.has("IMPORT_SCAN_CREATOR_TENANT_MISMATCH"), true);

  const clinicalImportGraph = {
    organizations: [{
      id: "org_clinical",
      status: "active",
      workspaceType: "clinic",
      ownerUserId: "user_clinical_owner",
    }],
    users: [{
      id: "user_reviewer",
      role: "doctor",
      organizationId: "org_clinical",
      accountStatus: "active",
      roleRequestStatus: "approved",
    }, {
      id: "user_clinical_owner",
      role: "workspace_owner",
      organizationId: "org_clinical",
      accountStatus: "active",
      roleRequestStatus: "approved",
    }],
    memberships: [{
      id: "membership_clinical_reviewer",
      organizationId: "org_clinical",
      userId: "user_reviewer",
      role: "doctor",
    }, {
      id: "membership_clinical_owner",
      organizationId: "org_clinical",
      userId: "user_clinical_owner",
      role: "workspace_owner",
    }],
    patients: [{ id: "patient_clinical", organizationId: "org_clinical" }],
    devices: [{ id: "device_clinical", organizationId: "org_clinical" }],
    scans: [{
      id: "scan_clinical",
      organizationId: "org_clinical",
      patientId: "patient_clinical",
      deviceId: "device_clinical",
      createdByUserId: "user_reviewer",
      status: "completed",
    }],
    scanReviews: [{
      id: "review_scan_clinical",
      scanId: "scan_clinical",
      organizationId: "org_clinical",
      patientId: "patient_clinical",
      status: "reviewed",
      decision: "accepted",
      note: "Reviewed from the legacy ledger",
      reviewerUserId: "user_reviewer",
      reviewedAt: "2026-07-16T09:05:00.000Z",
      version: 4,
      createdAt: "2026-07-16T09:00:00.000Z",
      updatedAt: "2026-07-16T09:05:00.000Z",
    }],
    clinicalAlerts: [{
      id: "alert_scan_clinical_1",
      organizationId: "org_clinical",
      sourceType: "scan",
      sourceId: "scan_clinical",
      dedupeKey: "scan:scan_clinical",
      occurrenceNumber: 1,
      occurredAt: "2026-07-16T09:01:00.000Z",
      status: "resolved",
      severity: "critical",
      title: "Signal quality requires follow-up",
      message: "The imported alert retains its complete lifecycle.",
      patientId: "patient_clinical",
      deviceId: "device_clinical",
      scanId: "scan_clinical",
      acknowledgedByUserId: "user_reviewer",
      acknowledgedAt: "2026-07-16T09:02:00.000Z",
      acknowledgementNote: "Acknowledged during review",
      resolvedByUserId: "user_reviewer",
      resolvedAt: "2026-07-16T09:04:00.000Z",
      resolutionNote: "Patient follow-up arranged",
      version: 4,
      metadata: { channel: "legacy-import", score: 0.94 },
      createdAt: "2026-07-16T09:01:00.000Z",
      updatedAt: "2026-07-16T09:04:00.000Z",
    }],
  };
  validateAndNormalizeImportGraph(clinicalImportGraph);
  assert.equal(clinicalImportGraph.scanReviews[0].status, "reviewed");
  assert.equal(clinicalImportGraph.scanReviews[0].version, 4);
  assert.equal(clinicalImportGraph.clinicalAlerts[0].status, "resolved");
  assert.equal(clinicalImportGraph.clinicalAlerts[0].occurrenceNumber, 1);

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{ id: "org_unauthorized_actor", status: "pending", workspaceType: "clinic" }],
      users: [{
        id: "user_unauthorized_actor",
        role: "patient",
        organizationId: "org_unauthorized_actor",
        accountStatus: "active",
      }],
      patients: [{ id: "patient_unauthorized_actor", organizationId: "org_unauthorized_actor" }],
      devices: [{ id: "device_unauthorized_actor", organizationId: "org_unauthorized_actor" }],
      scans: [{
        id: "scan_unauthorized_actor",
        organizationId: "org_unauthorized_actor",
        patientId: "patient_unauthorized_actor",
        deviceId: "device_unauthorized_actor",
        createdByUserId: "user_unauthorized_actor",
      }],
      scanReviews: [{
        id: "review_unauthorized_actor",
        scanId: "scan_unauthorized_actor",
        organizationId: "org_unauthorized_actor",
        patientId: "patient_unauthorized_actor",
        status: "reviewed",
        decision: "accepted",
        reviewerUserId: "user_unauthorized_actor",
        reviewedAt: "2026-07-16T09:05:00.000Z",
        version: 2,
      }],
      clinicalAlerts: [{
        id: "alert_unauthorized_actor",
        organizationId: "org_unauthorized_actor",
        sourceType: "scan",
        sourceId: "scan_unauthorized_actor",
        dedupeKey: "scan:scan_unauthorized_actor",
        occurrenceNumber: 1,
        occurredAt: "2026-07-16T09:01:00.000Z",
        status: "resolved",
        title: "Unauthorized lifecycle actor",
        message: "Patient identities cannot manage clinical ledgers.",
        patientId: "patient_unauthorized_actor",
        deviceId: "device_unauthorized_actor",
        scanId: "scan_unauthorized_actor",
        acknowledgedByUserId: "user_unauthorized_actor",
        acknowledgedAt: "2026-07-16T09:02:00.000Z",
        resolvedByUserId: "user_unauthorized_actor",
        resolvedAt: "2026-07-16T09:04:00.000Z",
        resolutionNote: "Invalid actor fixture",
        version: 3,
      }],
    }),
    (error) => {
      if (error.code !== "IMPORT_REFERENCE_VALIDATION_FAILED") return false;
      const codes = new Set(error.details.issues.map((issue) => issue.code));
      return codes.has("IMPORT_SCAN_REVIEW_ACTOR_UNAUTHORIZED") &&
        codes.has("IMPORT_CLINICAL_ALERT_ACTOR_UNAUTHORIZED");
    },
    "patient or no-membership actors must not manage review and alert ledgers",
  );

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{ id: "org_provenance", status: "pending", workspaceType: "clinic" }],
      patients: [{ id: "patient_provenance_1", organizationId: "org_provenance" }],
      devices: [{
        id: "device_provenance_1",
        organizationId: "org_provenance",
      }, {
        id: "device_provenance_2",
        organizationId: "org_provenance",
      }],
      scans: [{
        id: "scan_provenance_1",
        organizationId: "org_provenance",
        patientId: "patient_provenance_1",
        deviceId: "device_provenance_1",
      }],
      clinicalAlerts: [{
        id: "alert_same_tenant_wrong_source",
        organizationId: "org_provenance",
        sourceType: "scan",
        sourceId: "scan_provenance_1",
        dedupeKey: "scan:scan_provenance_1",
        occurrenceNumber: 1,
        occurredAt: "2026-07-16T10:00:00.000Z",
        status: "open",
        title: "Wrong same-tenant device provenance",
        message: "Tenant equality must not substitute for exact source binding.",
        patientId: "patient_provenance_1",
        deviceId: "device_provenance_2",
        scanId: "scan_provenance_1",
        version: 1,
      }],
    }),
    (error) =>
      error.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some((issue) =>
        issue.code === "IMPORT_CLINICAL_ALERT_PROVENANCE_MISMATCH" &&
        issue.entityId === "alert_same_tenant_wrong_source"),
    "same-tenant resources must still match the exact scan/device/patient provenance",
  );

  let invalidClinicalGraphError = null;
  try {
    validateAndNormalizeImportGraph({
      organizations: [
        { id: "org_clinical_a", status: "pending", workspaceType: "clinic" },
        { id: "org_clinical_b", status: "pending", workspaceType: "clinic" },
      ],
      users: [{ id: "user_clinical_a", role: "doctor", organizationId: "org_clinical_a" }],
      patients: [{ id: "patient_clinical_a", organizationId: "org_clinical_a" }],
      devices: [{ id: "device_clinical_a", organizationId: "org_clinical_a" }],
      scans: [{
        id: "scan_clinical_a",
        organizationId: "org_clinical_a",
        patientId: "patient_clinical_a",
        deviceId: "device_clinical_a",
        createdByUserId: "user_clinical_a",
      }],
      scanReviews: [{
        id: "review_invalid",
        scanId: "scan_clinical_a",
        organizationId: "org_clinical_b",
        patientId: "patient_clinical_a",
        status: "reviewed",
        decision: "accepted",
        version: 0,
      }],
      clinicalAlerts: [{
        id: "alert_invalid",
        organizationId: "org_clinical_b",
        sourceType: "scan",
        sourceId: "scan_clinical_a",
        dedupeKey: "scan:scan_clinical_a",
        occurrenceNumber: 0,
        status: "resolved",
        title: "Invalid cross-tenant alert",
        message: "Must fail before PostgreSQL is touched",
        patientId: "patient_clinical_a",
        deviceId: "device_clinical_a",
        scanId: "scan_clinical_a",
        version: 0,
      }],
    });
  } catch (error) {
    invalidClinicalGraphError = error;
  }
  assert.equal(invalidClinicalGraphError?.code, "IMPORT_REFERENCE_VALIDATION_FAILED");
  const invalidClinicalCodes = new Set(
    invalidClinicalGraphError.details.issues.map((issue) => issue.code),
  );
  for (const expectedCode of [
    "IMPORT_SCAN_REVIEW_TENANT_MISMATCH",
    "IMPORT_SCAN_REVIEW_VERSION_INVALID",
    "IMPORT_SCAN_REVIEW_REVIEWER_REQUIRED",
    "IMPORT_SCAN_REVIEW_REVIEWED_AT_REQUIRED",
    "IMPORT_CLINICAL_ALERT_TENANT_MISMATCH",
    "IMPORT_CLINICAL_ALERT_VERSION_INVALID",
    "IMPORT_CLINICAL_ALERT_OCCURRENCE_INVALID",
    "IMPORT_CLINICAL_ALERT_ACTOR_REQUIRED",
    "IMPORT_CLINICAL_ALERT_TIMESTAMP_REQUIRED",
    "IMPORT_CLINICAL_ALERT_RESOLUTION_NOTE_REQUIRED",
  ]) {
    assert.equal(invalidClinicalCodes.has(expectedCode), true, `${expectedCode} must fail closed`);
  }

  for (const [graph, expectedCode] of [
    [{
      organizations: [{ id: "org_claim", status: "pending", workspaceType: "clinic" }],
      devices: [{ id: "device_claim", organizationId: "org_claim" }],
      deviceClaims: [{
        id: "claim_plaintext",
        deviceId: "device_claim",
        organizationId: "org_claim",
        claimCodeHash: "sha256:claim-hash",
        claimCode: "plaintext-must-not-be-imported",
      }],
    }, "IMPORT_DEVICE_CLAIM_PLAINTEXT_FORBIDDEN"],
    [{
      organizations: [{ id: "org_claim", status: "pending", workspaceType: "clinic" }],
      devices: [{ id: "device_claim", organizationId: "org_claim" }],
      deviceClaims: [{
        id: "claim_unbound",
        organizationId: "org_claim",
        claimCodeHash: "sha256:claim-hash",
      }],
    }, "IMPORT_REFERENCE_REQUIRED"],
    [{
      organizations: [
        { id: "org_claim_a", status: "pending", workspaceType: "clinic" },
        { id: "org_claim_b", status: "pending", workspaceType: "clinic" },
      ],
      devices: [{ id: "device_claim_cross_tenant", organizationId: "org_claim_a" }],
      deviceClaims: [{
        id: "claim_cross_tenant",
        deviceId: "device_claim_cross_tenant",
        organizationId: "org_claim_b",
        claimCodeHash: "sha256:claim-hash",
      }],
    }, "IMPORT_DEVICE_CLAIM_TENANT_MISMATCH"],
  ]) {
    assert.throws(
      () => validateAndNormalizeImportGraph(graph),
      (error) =>
        error?.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
        error.details.issues.some((issue) => issue.code === expectedCode),
      `device claim validation must reject ${expectedCode}`,
    );
  }

  const scanSource = {
    id: "scan_canonical",
    organizationId: "org_scan",
    patientId: "patient_scan",
    deviceId: "device_scan",
    createdByUserId: "user_scan",
  };
  let preservedScanQueries = 0;
  const preservedScan = await upsertScan({
    async query() {
      preservedScanQueries += 1;
      return {
        rowCount: 1,
        rows: [{
          id: "scan_canonical",
          organization_id: "org_scan",
          patient_id: "patient_scan",
          device_id: "device_scan",
          created_by_user_id: "user_scan",
        }],
      };
    },
  }, scanSource);
  assert.equal(preservedScan.state, "preserved");
  assert.equal(preservedScanQueries, 1, "an existing scan must not be overwritten by stale lifecycle data");
  await assert.rejects(
    upsertScan({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            id: "scan_canonical",
            organization_id: "org_other",
            patient_id: "patient_scan",
            device_id: "device_scan",
            created_by_user_id: "user_scan",
          }],
        };
      },
    }, scanSource),
    (error) =>
      error.code === "IMPORT_SCAN_CANONICAL_CONFLICT" &&
      error.details.mismatchFields.includes("organizationId"),
  );

  const scanReviewSource = {
    id: "review_scan_canonical",
    scanId: "scan_canonical",
    organizationId: "org_scan",
    patientId: "patient_scan",
    status: "reviewed",
    decision: "follow_up_required",
    note: "Follow-up remains attached to the imported decision",
    reviewerUserId: "user_scan",
    reviewedAt: "2026-07-16T11:05:00.000Z",
    version: 4,
    createdAt: "2026-07-16T11:00:00.000Z",
    updatedAt: "2026-07-16T11:05:00.000Z",
  };
  const scanReviewInsertWrites = [];
  const insertedScanReview = await upsertScanReview({
    async query(sql, params = []) {
      scanReviewInsertWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: scanReviewSource.id }] };
    },
  }, scanReviewSource);
  assert.equal(insertedScanReview.state, "inserted");
  const scanReviewInsert = scanReviewInsertWrites.find((write) => /INSERT\s+INTO\s+scan_reviews/i.test(write.sql));
  assert.ok(scanReviewInsert, "a new scan review must be inserted into the canonical ledger");
  assert.match(
    scanReviewInsert.sql,
    /scan_id[\s\S]*organization_id[\s\S]*patient_id[\s\S]*status[\s\S]*decision[\s\S]*note[\s\S]*reviewer_user_id[\s\S]*reviewed_at[\s\S]*version[\s\S]*created_at[\s\S]*updated_at/i,
  );
  for (const expectedValue of [
    scanReviewSource.scanId,
    scanReviewSource.organizationId,
    scanReviewSource.patientId,
    scanReviewSource.status,
    scanReviewSource.decision,
    scanReviewSource.note,
    scanReviewSource.reviewerUserId,
    scanReviewSource.reviewedAt,
    scanReviewSource.version,
    scanReviewSource.createdAt,
    scanReviewSource.updatedAt,
  ]) {
    assert.ok(
      scanReviewInsert.params.includes(expectedValue),
      `scan review insert must retain ${String(expectedValue)}`,
    );
  }

  const canonicalScanReviewRow = {
    id: scanReviewSource.id,
    scan_id: scanReviewSource.scanId,
    organization_id: scanReviewSource.organizationId,
    patient_id: scanReviewSource.patientId,
    status: scanReviewSource.status,
    decision: scanReviewSource.decision,
    note: scanReviewSource.note,
    reviewer_user_id: scanReviewSource.reviewerUserId,
    reviewed_at: scanReviewSource.reviewedAt,
    version: scanReviewSource.version,
    created_at: scanReviewSource.createdAt,
    updated_at: scanReviewSource.updatedAt,
  };
  let scanReviewReplayQueries = 0;
  const replayedScanReview = await upsertScanReview({
    async query(sql) {
      scanReviewReplayQueries += 1;
      assert.match(sql, /WHERE\s+id\s*=\s*\$1\s+OR\s+scan_id\s*=\s*\$2/i);
      return { rowCount: 1, rows: [canonicalScanReviewRow] };
    },
  }, scanReviewSource);
  assert.equal(replayedScanReview.state, "preserved");
  assert.equal(scanReviewReplayQueries, 1, "replaying an identical scan review must not write again");

  const sourceLinkedReview = {
    ...scanReviewSource,
    id: "review_source_audit",
    status: "pending",
    decision: "",
    note: "",
    reviewerUserId: "",
    reviewedAt: "",
    version: 1,
    updatedAt: "2026-07-16T11:00:00.000Z",
  };
  const backfillReviewWrites = [];
  const rekeyedBackfillReview = await upsertScanReview({
    async query(sql, params = []) {
      backfillReviewWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: "review_scan_canonical",
            scan_id: sourceLinkedReview.scanId,
            organization_id: sourceLinkedReview.organizationId,
            patient_id: sourceLinkedReview.patientId,
            status: "pending",
            decision: null,
            note: null,
            reviewer_user_id: null,
            reviewed_at: null,
            version: 1,
            created_at: sourceLinkedReview.createdAt,
            updated_at: sourceLinkedReview.updatedAt,
          }],
        };
      }
      return { rowCount: 1, rows: [{ id: sourceLinkedReview.id }] };
    },
  }, sourceLinkedReview);
  assert.equal(rekeyedBackfillReview.state, "updated");
  const backfillReviewRekey = backfillReviewWrites.find((write) => /^\s*UPDATE\s+scan_reviews/i.test(write.sql));
  assert.ok(backfillReviewRekey, "the generated pending review alias must be reconciled to the source review id");
  assert.match(backfillReviewRekey.sql, /SET\s+id\s*=\s*\$2/i);
  assert.equal(backfillReviewRekey.params[0], "review_scan_canonical");
  assert.equal(backfillReviewRekey.params[1], sourceLinkedReview.id);

  const scanReviewUpdateWrites = [];
  const updatedScanReview = await upsertScanReview({
    async query(sql, params = []) {
      scanReviewUpdateWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            ...canonicalScanReviewRow,
            status: "pending",
            decision: null,
            note: null,
            reviewer_user_id: null,
            reviewed_at: null,
            version: 2,
            updated_at: "2026-07-16T11:01:00.000Z",
          }],
        };
      }
      return { rowCount: 1, rows: [{ id: scanReviewSource.id }] };
    },
  }, scanReviewSource);
  assert.equal(updatedScanReview.state, "updated");
  const scanReviewUpdate = scanReviewUpdateWrites.find((write) => /^\s*UPDATE\s+scan_reviews/i.test(write.sql));
  assert.ok(scanReviewUpdate, "a newer reviewed version must update the canonical review ledger");
  assert.match(
    scanReviewUpdate.sql,
    /status[\s\S]*decision[\s\S]*note[\s\S]*reviewer_user_id[\s\S]*reviewed_at[\s\S]*version[\s\S]*updated_at/i,
  );
  for (const expectedValue of [
    scanReviewSource.status,
    scanReviewSource.decision,
    scanReviewSource.note,
    scanReviewSource.reviewerUserId,
    scanReviewSource.reviewedAt,
    scanReviewSource.version,
    scanReviewSource.updatedAt,
  ]) {
    assert.ok(
      scanReviewUpdate.params.includes(expectedValue),
      `scan review update must retain ${String(expectedValue)}`,
    );
  }

  await assert.rejects(
    upsertScanReview({
      async query() {
        return { rowCount: 1, rows: [canonicalScanReviewRow] };
      },
    }, {
      ...scanReviewSource,
      status: "pending",
      decision: "",
      note: "",
      reviewerUserId: "",
      reviewedAt: "",
      version: 5,
    }),
    (error) => error.code === "IMPORT_SCAN_REVIEW_LIFECYCLE_CONFLICT",
  );

  const clinicalAlertSource = {
    id: "alert_scan_canonical_2",
    organizationId: "org_scan",
    sourceType: "scan",
    sourceId: "scan_canonical",
    dedupeKey: "scan:scan_canonical",
    occurrenceNumber: 2,
    previousAlertId: "alert_scan_canonical_1",
    occurredAt: "2026-07-16T11:01:00.000Z",
    status: "resolved",
    severity: "critical",
    title: "Repeated signal-quality alert",
    message: "Second occurrence is retained as a separate ledger entry.",
    patientId: "patient_scan",
    deviceId: "device_scan",
    scanId: "scan_canonical",
    acknowledgedByUserId: "user_scan",
    acknowledgedAt: "2026-07-16T11:02:00.000Z",
    acknowledgementNote: "Clinician acknowledged the recurrence",
    resolvedByUserId: "user_scan",
    resolvedAt: "2026-07-16T11:04:00.000Z",
    resolutionNote: "Follow-up measurement scheduled",
    version: 4,
    metadata: { channel: "legacy-import", packetGapCount: 3 },
    createdAt: "2026-07-16T11:01:00.000Z",
    updatedAt: "2026-07-16T11:04:00.000Z",
  };
  const clinicalAlertInsertWrites = [];
  const insertedClinicalAlert = await upsertClinicalAlert({
    async query(sql, params = []) {
      clinicalAlertInsertWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: clinicalAlertSource.id }] };
    },
  }, clinicalAlertSource);
  assert.equal(insertedClinicalAlert.state, "inserted");
  const clinicalAlertInsert = clinicalAlertInsertWrites.find((write) => /INSERT\s+INTO\s+clinical_alerts/i.test(write.sql));
  assert.ok(clinicalAlertInsert, "a new clinical alert occurrence must be inserted into the canonical ledger");
  assert.match(
    clinicalAlertInsert.sql,
    /source_type[\s\S]*source_id[\s\S]*dedupe_key[\s\S]*occurrence_number[\s\S]*previous_alert_id[\s\S]*occurred_at[\s\S]*status[\s\S]*acknowledged_by_user_id[\s\S]*acknowledged_at[\s\S]*acknowledgement_note[\s\S]*resolved_by_user_id[\s\S]*resolved_at[\s\S]*resolution_note[\s\S]*version[\s\S]*metadata[\s\S]*created_at[\s\S]*updated_at/i,
  );
  for (const expectedValue of [
    clinicalAlertSource.organizationId,
    clinicalAlertSource.sourceType,
    clinicalAlertSource.sourceId,
    clinicalAlertSource.dedupeKey,
    clinicalAlertSource.occurrenceNumber,
    clinicalAlertSource.previousAlertId,
    clinicalAlertSource.occurredAt,
    clinicalAlertSource.status,
    clinicalAlertSource.severity,
    clinicalAlertSource.title,
    clinicalAlertSource.message,
    clinicalAlertSource.patientId,
    clinicalAlertSource.deviceId,
    clinicalAlertSource.scanId,
    clinicalAlertSource.acknowledgedByUserId,
    clinicalAlertSource.acknowledgedAt,
    clinicalAlertSource.acknowledgementNote,
    clinicalAlertSource.resolvedByUserId,
    clinicalAlertSource.resolvedAt,
    clinicalAlertSource.resolutionNote,
    clinicalAlertSource.version,
    JSON.stringify(clinicalAlertSource.metadata),
    clinicalAlertSource.createdAt,
    clinicalAlertSource.updatedAt,
  ]) {
    assert.ok(
      clinicalAlertInsert.params.includes(expectedValue),
      `clinical alert insert must retain ${String(expectedValue)}`,
    );
  }

  const canonicalClinicalAlertRow = {
    id: clinicalAlertSource.id,
    organization_id: clinicalAlertSource.organizationId,
    source_type: clinicalAlertSource.sourceType,
    source_id: clinicalAlertSource.sourceId,
    dedupe_key: clinicalAlertSource.dedupeKey,
    occurrence_number: clinicalAlertSource.occurrenceNumber,
    previous_alert_id: clinicalAlertSource.previousAlertId,
    occurred_at: clinicalAlertSource.occurredAt,
    status: clinicalAlertSource.status,
    severity: clinicalAlertSource.severity,
    title: clinicalAlertSource.title,
    message: clinicalAlertSource.message,
    patient_id: clinicalAlertSource.patientId,
    device_id: clinicalAlertSource.deviceId,
    scan_id: clinicalAlertSource.scanId,
    acknowledged_by_user_id: clinicalAlertSource.acknowledgedByUserId,
    acknowledged_at: clinicalAlertSource.acknowledgedAt,
    acknowledgement_note: clinicalAlertSource.acknowledgementNote,
    resolved_by_user_id: clinicalAlertSource.resolvedByUserId,
    resolved_at: clinicalAlertSource.resolvedAt,
    resolution_note: clinicalAlertSource.resolutionNote,
    version: clinicalAlertSource.version,
    metadata: clinicalAlertSource.metadata,
    created_at: clinicalAlertSource.createdAt,
    updated_at: clinicalAlertSource.updatedAt,
  };
  let clinicalAlertReplayQueries = 0;
  const replayedClinicalAlert = await upsertClinicalAlert({
    async query(sql) {
      clinicalAlertReplayQueries += 1;
      assert.match(sql, /FROM\s+clinical_alerts[\s\S]*WHERE\s+id\s*=\s*\$1/i);
      return { rowCount: 1, rows: [canonicalClinicalAlertRow] };
    },
  }, clinicalAlertSource);
  assert.equal(replayedClinicalAlert.state, "preserved");
  assert.equal(clinicalAlertReplayQueries, 1, "replaying an identical alert occurrence must not write again");

  const migrationStampedAlertWrites = [];
  const correctedMigrationStampedAlert = await upsertClinicalAlert({
    async query(sql, params = []) {
      migrationStampedAlertWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            ...canonicalClinicalAlertRow,
            occurred_at: "2026-07-18T00:00:00.000Z",
          }],
        };
      }
      return { rowCount: 1, rows: [{ id: clinicalAlertSource.id }] };
    },
  }, clinicalAlertSource);
  assert.equal(correctedMigrationStampedAlert.state, "updated");
  const migrationStampCorrection = migrationStampedAlertWrites.find(
    (write) => /^\s*UPDATE\s+clinical_alerts/i.test(write.sql),
  );
  assert.ok(migrationStampCorrection, "a migration-generated occurredAt must not hide the source event time");
  assert.match(migrationStampCorrection.sql, /occurred_at\s*=\s*COALESCE\(\$2::timestamptz,\s*occurred_at\)/i);
  assert.equal(migrationStampCorrection.params[1], clinicalAlertSource.occurredAt);

  await assert.rejects(
    upsertClinicalAlert({
      async query() {
        return {
          rowCount: 1,
          rows: [{ ...canonicalClinicalAlertRow, id: "alert_same_occurrence_other_id" }],
        };
      },
    }, clinicalAlertSource),
    (error) =>
      error.code === "IMPORT_CLINICAL_ALERT_CANONICAL_CONFLICT" &&
      error.details.mismatchFields.includes("id"),
    "one source occurrence must never reconcile to a different alert id",
  );

  const clinicalAlertUpdateWrites = [];
  const updatedClinicalAlert = await upsertClinicalAlert({
    async query(sql, params = []) {
      clinicalAlertUpdateWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            ...canonicalClinicalAlertRow,
            status: "acknowledged",
            resolved_by_user_id: null,
            resolved_at: null,
            resolution_note: null,
            version: 3,
            updated_at: "2026-07-16T11:03:00.000Z",
          }],
        };
      }
      return { rowCount: 1, rows: [{ id: clinicalAlertSource.id }] };
    },
  }, clinicalAlertSource);
  assert.equal(updatedClinicalAlert.state, "updated");
  const clinicalAlertUpdate = clinicalAlertUpdateWrites.find((write) => /^\s*UPDATE\s+clinical_alerts/i.test(write.sql));
  assert.ok(clinicalAlertUpdate, "a newer resolved version must update the canonical alert occurrence");
  for (const column of [
    "occurred_at",
    "status",
    "severity",
    "title",
    "message",
    "acknowledged_by_user_id",
    "acknowledged_at",
    "acknowledgement_note",
    "resolved_by_user_id",
    "resolved_at",
    "resolution_note",
    "version",
    "metadata",
    "updated_at",
  ]) {
    assert.match(clinicalAlertUpdate.sql, new RegExp(`\\b${column}\\b`, "i"));
  }
  for (const expectedValue of [
    clinicalAlertSource.status,
    clinicalAlertSource.severity,
    clinicalAlertSource.title,
    clinicalAlertSource.message,
    clinicalAlertSource.acknowledgedByUserId,
    clinicalAlertSource.acknowledgedAt,
    clinicalAlertSource.acknowledgementNote,
    clinicalAlertSource.resolvedByUserId,
    clinicalAlertSource.resolvedAt,
    clinicalAlertSource.resolutionNote,
    clinicalAlertSource.version,
    JSON.stringify(clinicalAlertSource.metadata),
    clinicalAlertSource.occurredAt,
    clinicalAlertSource.updatedAt,
  ]) {
    assert.ok(
      clinicalAlertUpdate.params.includes(expectedValue),
      `clinical alert update must retain ${String(expectedValue)}`,
    );
  }

  await assert.rejects(
    upsertAudioFile({
      async query() {
        return { rowCount: 1, rows: [{ id: "audio_canonical", scan_id: "scan_other", patient_id: "patient_scan" }] };
      },
    }, { id: "audio_canonical", scanId: "scan_canonical", patientId: "patient_scan" }),
    (error) =>
      error.code === "IMPORT_AUDIO_CANONICAL_CONFLICT" &&
      error.details.mismatchFields.includes("scanId"),
  );
  await assert.rejects(
    upsertAiResult({
      async query() {
        return { rowCount: 1, rows: [{ id: "ai_canonical", scan_id: "scan_other" }] };
      },
    }, { id: "ai_canonical", scanId: "scan_canonical" }),
    (error) => error.code === "IMPORT_AI_RESULT_CANONICAL_CONFLICT",
  );
  let notificationAudienceSql = "";
  await assert.rejects(
    upsertNotification({
      async query(sql) {
        if (/AS\s+audience_valid/i.test(sql)) {
          notificationAudienceSql = sql;
          return { rowCount: 1, rows: [{ audience_valid: true }] };
        }
        return {
          rowCount: 1,
          rows: [{ id: "notification_canonical", user_id: "user_other", organization_id: "org_scan" }],
        };
      },
    }, { id: "notification_canonical", userId: "user_scan", organizationId: "org_scan" }),
    (error) =>
      error.code === "IMPORT_NOTIFICATION_CANONICAL_CONFLICT" &&
      error.details.mismatchFields.includes("userId"),
  );
  assert.match(
    notificationAudienceSql,
    /COALESCE\s*\(\s*audience_membership\.status,\s*'active'\s*\)\s*=\s*'active'/i,
  );
  await assert.rejects(
    upsertNotification({
      async query(sql) {
        if (/AS\s+audience_valid/i.test(sql)) {
          return { rowCount: 1, rows: [{ audience_valid: false }] };
        }
        return { rowCount: 0, rows: [] };
      },
    }, {
      id: "notification_cross_tenant",
      userId: "user_other_workspace",
      organizationId: "org_scan",
      title: "Private clinical update",
      message: "Must not cross tenants",
    }),
    (error) => error.code === "IMPORT_NOTIFICATION_CANONICAL_AUDIENCE_INVALID",
  );

  assert.throws(
    () => validateAndNormalizeImportGraph({
      organizations: [{ id: "org_identity", status: "pending" }],
      users: [{ id: "user_patient", role: "patient", organizationId: "org_identity" }],
      memberships: [{
        id: "membership_invalid_owner",
        organizationId: "org_identity",
        userId: "user_patient",
        role: "workspace_owner",
      }],
    }),
    (error) =>
      error.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some((issue) => issue.code === "IMPORT_MEMBERSHIP_ROLE_INCONSISTENT"),
  );

  const deviceSource = {
    id: "device_canonical",
    organizationId: "org_identity",
    pairedUserId: "user_patient",
    revokedAt: "2026-07-15T00:00:00.000Z",
  };
  const deviceWrites = [];
  const revokedDevice = await upsertDevice({
    async query(sql, params) {
      deviceWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: "device_canonical",
            organization_id: "org_identity",
            paired_user_id: "user_patient",
            ownership_state: "claimed",
            owner_user_id: "user_patient",
            assigned_patient_id: null,
            revoked_by_user_id: null,
            secret_hash: "sha256:existing",
            revoked_at: null,
          }],
        };
      }
      return { rowCount: 1, rows: [{ id: params[0], revoked_at: params[1] }] };
    },
  }, deviceSource);
  assert.equal(revokedDevice.state, "updated");
  assert.match(
    deviceWrites[1].sql,
    /revoked_at\s*=\s*(?:COALESCE\(revoked_at,\s*\$2::timestamptz\)|CASE\s+WHEN\s+\$6::timestamptz\s+IS\s+NULL\s+THEN\s+revoked_at\s+ELSE\s+COALESCE\(revoked_at,\s*\$6::timestamptz\)\s+END)/i,
  );
  assert.match(
    deviceWrites[1].sql,
    /connected\s*=\s*(?:false|CASE\s+WHEN[\s\S]*?ELSE\s+false\s+END)/i,
  );
  assert.match(
    deviceWrites[1].sql,
    /status\s*=\s*(?:'revoked'|CASE\s+WHEN[\s\S]*?ELSE\s+'revoked'\s+END)/i,
  );

  let preservedRevokedDeviceQueries = 0;
  const preservedRevokedDevice = await upsertDevice({
    async query() {
      preservedRevokedDeviceQueries += 1;
      return {
        rowCount: 1,
        rows: [{
          id: "device_canonical",
          organization_id: "org_identity",
          paired_user_id: "user_patient",
          ownership_state: "revoked",
          owner_user_id: "user_patient",
          assigned_patient_id: null,
          revoked_by_user_id: null,
          secret_hash: "sha256:existing",
          revoked_at: "2026-07-14T00:00:00.000Z",
        }],
      };
    },
  }, { id: "device_canonical", organizationId: "org_identity", pairedUserId: "user_patient" });
  assert.equal(preservedRevokedDevice.state, "preserved");
  assert.equal(preservedRevokedDeviceQueries, 1, "a revoked device must never be revived by reimport");
  await assert.rejects(
    upsertDevice({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            id: "device_canonical",
            organization_id: "org_other",
            paired_user_id: "user_other",
            ownership_state: "claimed",
            owner_user_id: "user_other",
            assigned_patient_id: null,
            revoked_by_user_id: null,
            secret_hash: null,
            revoked_at: null,
          }],
        };
      },
    }, { id: "device_canonical", organizationId: "org_identity", pairedUserId: "user_patient" }),
    (error) =>
      error.code === "IMPORT_DEVICE_CANONICAL_CONFLICT" &&
      ["organizationId", "pairedUserId"].every((field) => error.details.mismatchFields.includes(field)),
  );
  await assert.rejects(
    upsertDevice({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            id: "device_canonical",
            organization_id: "org_identity",
            paired_user_id: "user_patient",
            ownership_state: "claimed",
            owner_user_id: "user_patient",
            assigned_patient_id: null,
            revoked_by_user_id: null,
            secret_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            revoked_at: null,
          }],
        };
      },
    }, {
      id: "device_canonical",
      organizationId: "org_identity",
      pairedUserId: "user_patient",
      secret: "different-device-secret",
    }),
    (error) =>
      error.code === "IMPORT_DEVICE_CANONICAL_CONFLICT" &&
      error.details.mismatchFields.includes("secretHash"),
  );
  const unscopedDeviceWrites = [];
  const insertedUnscopedDevice = await upsertDevice({
    async query(sql, params) {
      unscopedDeviceWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, { id: "device_unscoped", name: "Unscoped" });
  assert.equal(insertedUnscopedDevice.state, "inserted");
  const deviceInsert = unscopedDeviceWrites.find((write) => /INSERT\s+INTO\s+devices/i.test(write.sql));
  assert.equal(deviceInsert.params[1], null, "a missing device tenant must stay null instead of defaulting");
  assert.doesNotMatch(deviceInsert.sql, /DO\s+UPDATE/i);

  const lifecycleDeviceWrites = [];
  const insertedLifecycleDevice = await upsertDevice({
    async query(sql, params) {
      lifecycleDeviceWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "device_lifecycle_insert",
    organizationId: "org_identity",
    pairedUserId: "user_patient",
    ownerUserId: "user_patient",
    ownershipState: "revoked",
    assignedPatientId: "patient_self",
    revokedByUserId: "user_operator",
    revokedAt: "2026-07-15T12:00:00.000Z",
  });
  assert.equal(insertedLifecycleDevice.state, "inserted");
  const lifecycleDeviceInsert = lifecycleDeviceWrites.find(
    (write) => /INSERT\s+INTO\s+devices/i.test(write.sql),
  );
  assert.match(
    lifecycleDeviceInsert.sql,
    /paired_user_id,\s*ownership_state,\s*owner_user_id,\s*assigned_patient_id,\s*revoked_by_user_id/i,
  );
  assert.deepEqual(
    lifecycleDeviceInsert.params.slice(2, 7),
    ["user_patient", "revoked", "user_patient", "patient_self", "user_operator"],
    "device insert must bind the compatibility owner alias and every ownership lifecycle field",
  );

  const claimSource = {
    id: "claim_lifecycle",
    deviceId: "device_canonical",
    organizationId: "org_identity",
    claimCodeHash: "sha256:canonical-claim-hash",
    createdByUserId: "user_operator",
    claimedByUserId: "user_patient",
    expiresAt: "2026-07-20T00:00:00.000Z",
    claimedAt: "2026-07-15T10:00:00.000Z",
    revokedAt: "2026-07-16T10:00:00.000Z",
    revokedByUserId: "user_operator",
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
  };
  const claimInsertWrites = [];
  const insertedClaim = await upsertDeviceClaim({
    async query(sql, params) {
      claimInsertWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, claimSource);
  assert.equal(insertedClaim.state, "inserted");
  const claimInsert = claimInsertWrites.find((write) => /INSERT\s+INTO\s+device_claims/i.test(write.sql));
  assert.match(
    claimInsert.sql,
    /created_by_user_id,\s*claimed_by_user_id,\s*expires_at,\s*claimed_at,\s*revoked_at,\s*revoked_by_user_id,\s*created_at,\s*updated_at/i,
  );
  assert.deepEqual(claimInsert.params, [
    "claim_lifecycle",
    "device_canonical",
    "org_identity",
    "sha256:canonical-claim-hash",
    "user_operator",
    "user_patient",
    "2026-07-20T00:00:00.000Z",
    "2026-07-15T10:00:00.000Z",
    "2026-07-16T10:00:00.000Z",
    "user_operator",
    "2026-07-14T10:00:00.000Z",
    "2026-07-16T10:00:00.000Z",
  ]);

  let preservedClaimQueries = 0;
  const preservedClaim = await upsertDeviceClaim({
    async query() {
      preservedClaimQueries += 1;
      return {
        rowCount: 1,
        rows: [{
          id: "claim_lifecycle",
          device_id: "device_canonical",
          organization_id: "org_identity",
          claim_code_hash: "sha256:canonical-claim-hash",
          claimed_by_user_id: null,
          claimed_at: null,
          revoked_at: null,
        }],
      };
    },
  }, claimSource);
  assert.equal(preservedClaim.state, "preserved");
  assert.equal(preservedClaimQueries, 1, "same canonical claim identity must preserve database lifecycle state");

  await assert.rejects(
    upsertDeviceClaim({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            id: "claim_lifecycle",
            device_id: "device_other",
            organization_id: "org_other",
            claim_code_hash: "sha256:other-claim-hash",
            claimed_by_user_id: null,
            claimed_at: null,
            revoked_at: null,
          }],
        };
      },
    }, claimSource),
    (error) =>
      error?.code === "IMPORT_DEVICE_CLAIM_CANONICAL_CONFLICT" &&
      ["deviceId", "organizationId", "claimCodeHash"].every(
        (field) => error.details.mismatchFields.includes(field),
      ),
  );

  const shareSource = {
    id: "share_monotonic",
    doctorUserId: "user_doctor",
    doctorId: "user_doctor",
    patientId: "patient_self",
    accessLevel: "read",
    scope: "patient_profile",
  };
  const canonicalShareRow = {
    id: "share_monotonic",
    doctor_user_id: "user_doctor",
    doctor_id: "user_doctor",
    patient_id: "patient_self",
    organization_id: null,
    access_level: "read",
    scope: "patient_profile",
    scan_ids: [],
    expires_at: null,
    revoked_at: null,
    revoked_by_user_id: null,
  };
  await assert.rejects(
    upsertDoctorPatientAccess({
      async query(sql) {
        if (/AS\s+authority_valid/i.test(sql)) {
          return { rowCount: 1, rows: [{ authority_valid: false }] };
        }
        return { rowCount: 0, rows: [] };
      },
    }, shareSource),
    (error) => error.code === "IMPORT_SHARE_CANONICAL_DOCTOR_AUTHORITY_INVALID",
  );
  const shareRevocationWrites = [];
  const revokedShare = await upsertDoctorPatientAccess({
    async query(sql, params) {
      shareRevocationWrites.push({ sql, params });
      if (/AS\s+authority_valid/i.test(sql)) return { rowCount: 1, rows: [{ authority_valid: true }] };
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 1, rows: [canonicalShareRow] };
      return { rowCount: 1, rows: [{ id: params[0], revoked_at: params[1] }] };
    },
  }, { ...shareSource, revokedAt: "2026-07-15T00:00:00.000Z" });
  assert.equal(revokedShare.state, "updated");
  assert.match(
    shareRevocationWrites.find((write) => /^\s*UPDATE\s+doctor_patient_access/i.test(write.sql)).sql,
    /revoked_at\s*=\s*COALESCE\(revoked_at,\s*\$2::timestamptz\)/i,
  );

  let revokedShareQueries = 0;
  const preservedShare = await upsertDoctorPatientAccess({
    async query(sql) {
      revokedShareQueries += 1;
      if (/AS\s+authority_valid/i.test(sql)) return { rowCount: 1, rows: [{ authority_valid: true }] };
      return { rowCount: 1, rows: [{ ...canonicalShareRow, revoked_at: "2026-07-14T00:00:00.000Z" }] };
    },
  }, shareSource);
  assert.equal(preservedShare.state, "preserved");
  assert.equal(revokedShareQueries, 3, "an already revoked share must not be revived");
  await assert.rejects(
    upsertDoctorPatientAccess({
      async query(sql) {
        if (/AS\s+authority_valid/i.test(sql)) return { rowCount: 1, rows: [{ authority_valid: true }] };
        return {
          rowCount: 1,
          rows: [{
            ...canonicalShareRow,
            patient_id: "patient_other",
            doctor_user_id: "user_doctor_other",
            doctor_id: "user_doctor_other",
          }],
        };
      },
    }, shareSource),
    (error) =>
      error.code === "IMPORT_SHARE_CANONICAL_CONFLICT" &&
      ["patientId", "doctorUserId"].every((field) => error.details.mismatchFields.includes(field)),
  );
  let shareLookupIndex = 0;
  await assert.rejects(
    upsertDoctorPatientAccess({
      async query(sql) {
        if (/AS\s+authority_valid/i.test(sql)) return { rowCount: 1, rows: [{ authority_valid: true }] };
        shareLookupIndex += 1;
        return {
          rowCount: 1,
          rows: [{ ...canonicalShareRow, id: shareLookupIndex === 1 ? "share_monotonic" : "share_duplicate" }],
        };
      },
    }, shareSource),
    (error) => error.code === "IMPORT_SHARE_CANONICAL_AMBIGUOUS",
  );

  const counter = createImportCounter();
  recordImportOutcome(counter, { state: "inserted", rowCount: 1 });
  recordImportOutcome(counter, { state: "preserved", rowCount: 0 });
  recordImportOutcome(counter, { state: "updated", rowCount: 1 });
  recordImportOutcome(counter, { rowCount: 1 });
  recordImportOutcome(counter, { rowCount: 0 });
  assert.deepEqual(counter, { inserted: 1, preserved: 2, updated: 1, written: 1 });

  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "014_identity_profile_contracts.sql"),
    "utf8",
  );
  assert.match(migration, /organization_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+legacy_patient\.organization_id/i);
  assert.match(migration, /identity profile backfill blocked/i);
  assert.match(migration, /duplicate_account_count/i);
  assert.match(migration, /ownership_conflict_count/i);
  const reconciliationMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "021_patient_identity_reconciliation.sql"),
    "utf8",
  );
  assert.match(reconciliationMigration, /patients_active_account_user_uidx/i);
  assert.match(reconciliationMigration, /users_patient_identity_uidx/i);
  assert.match(reconciliationMigration, /validate_patient_identity_references/i);
  assert.match(reconciliationMigration, /validate_user_patient_identity_transition/i);
  assert.match(reconciliationMigration, /account\.organization_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+patient\.organization_id/i);
  assert.match(reconciliationMigration, /LOCK\s+TABLE\s+users,\s*patients\s+IN\s+SHARE\s+ROW\s+EXCLUSIVE\s+MODE/i);
  assert.match(
    reconciliationMigration,
    /CREATE\s+CONSTRAINT\s+TRIGGER\s+patients_validate_identity_references[\s\S]*?AFTER\s+INSERT\s+OR\s+UPDATE\s+ON\s+patients[\s\S]*?DEFERRABLE\s+INITIALLY\s+DEFERRED/i,
  );
  assert.match(
    reconciliationMigration,
    /CREATE\s+CONSTRAINT\s+TRIGGER\s+users_validate_patient_identity_transition[\s\S]*?AFTER\s+INSERT\s+OR\s+UPDATE\s+ON\s+users[\s\S]*?DEFERRABLE\s+INITIALLY\s+DEFERRED/i,
  );
  assert.match(reconciliationMigration, /current_patient\s+patients%ROWTYPE/i);
  assert.match(reconciliationMigration, /current_user\s+users%ROWTYPE/i);
  assert.match(
    reconciliationMigration,
    /UPDATE\s+users\s+account\s+SET\s+patient_id\s*=\s*patient\.id[\s\S]*?patient\.account_user_id\s*=\s*account\.id[\s\S]*?account\.patient_id\s+IS\s+NULL/i,
  );
  assert.match(reconciliationMigration, /account\.patient_id\s+IS\s+DISTINCT\s+FROM\s+patient\.id/i);
  assert.match(reconciliationMigration, /patient account user inverse identity is invalid/i);
  assert.match(reconciliationMigration, /user patient inverse identity is invalid/i);
  assert.match(reconciliationMigration, /user is missing the canonical patient inverse identity/i);
  assert.match(
    reconciliationMigration,
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+users_patient_identity_uidx[\s\S]*?WHERE\s+patient_id\s+IS\s+NOT\s+NULL\s*;/i,
  );
  assert.doesNotMatch(reconciliationMigration, /account\.role\s*=\s*'patient'/i);
  assert.ok(
    reconciliationMigration.indexOf("LOCK TABLE users, patients") < reconciliationMigration.indexOf("tenant_mismatch_count"),
    "identity tables must be locked before migration preflight",
  );

  const migrationFiles = fs.readdirSync(path.join(__dirname, "..", "db", "migrations"))
    .filter((name) => name.endsWith(".sql"));
  const appliedMigrations = new Set(
    migrationFiles
      .map((name) => name.replace(/\.sql$/, ""))
      .filter((id) => id !== "021_patient_identity_reconciliation"),
  );
  const executedMigrationSql = [];
  await runMigrations({
    async query(sql, params = []) {
      const text = String(sql).trim();
      if (text.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) return { rowCount: 0, rows: [] };
      if (text.startsWith("SELECT 1 FROM schema_migrations")) {
        return { rowCount: appliedMigrations.has(params[0]) ? 1 : 0, rows: [] };
      }
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rowCount: 0, rows: [] };
      if (text.startsWith("INSERT INTO schema_migrations")) {
        appliedMigrations.add(params[0]);
        return { rowCount: 1, rows: [] };
      }
      executedMigrationSql.push(text);
      return { rowCount: 0, rows: [] };
    },
  });
  assert.equal(executedMigrationSql.length, 1, "an upgrade with 014 recorded must still execute migration 021");
  assert.match(executedMigrationSql[0], /patients_active_account_user_uidx/i);
  assert.equal(appliedMigrations.has("021_patient_identity_reconciliation"), true);

  const deviceOwnershipMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "028_device_ownership_claim_lifecycle.sql"),
    "utf8",
  );
  assert.match(
    deviceOwnershipMigration,
    /devices_owner_alias_check[\s\S]*?CHECK\s*\(paired_user_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+owner_user_id\)/i,
  );
  assert.match(
    deviceOwnershipMigration,
    /devices_ownership_shape_check[\s\S]*?ownership_state\s*=\s*'provisioned'[\s\S]*?owner_user_id\s+IS\s+NULL[\s\S]*?assigned_patient_id\s+IS\s+NULL[\s\S]*?revoked_at\s+IS\s+NULL/i,
  );
  assert.match(
    deviceOwnershipMigration,
    /ownership_state\s+IN\s*\('claimed',\s*'unassigned'\)[\s\S]*?owner_user_id\s+IS\s+NOT\s+NULL[\s\S]*?assigned_patient_id\s+IS\s+NULL[\s\S]*?revoked_at\s+IS\s+NULL/i,
  );
  assert.match(
    deviceOwnershipMigration,
    /ownership_state\s*=\s*'assigned'[\s\S]*?owner_user_id\s+IS\s+NOT\s+NULL[\s\S]*?assigned_patient_id\s+IS\s+NOT\s+NULL[\s\S]*?revoked_at\s+IS\s+NULL/i,
  );
  assert.match(
    deviceOwnershipMigration,
    /ownership_state\s*=\s*'revoked'[\s\S]*?revoked_at\s+IS\s+NOT\s+NULL[\s\S]*?connected\s*=\s*false/i,
  );

  const clinicalLedgerMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "029_clinical_review_alert_ledgers.sql"),
    "utf8",
  );
  assert.match(clinicalLedgerMigration, /ALTER\s+TABLE\s+scan_reviews\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(clinicalLedgerMigration, /ALTER\s+TABLE\s+clinical_alerts\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(clinicalLedgerMigration, /REVOKE\s+ALL\s+ON\s+TABLE\s+scan_reviews\s+FROM\s+PUBLIC/i);
  assert.match(clinicalLedgerMigration, /REVOKE\s+ALL\s+ON\s+TABLE\s+clinical_alerts\s+FROM\s+PUBLIC/i);
  assert.match(clinicalLedgerMigration, /REVOKE\s+ALL\s+ON\s+TABLE\s+scan_reviews\s+FROM\s+anon/i);
  assert.match(clinicalLedgerMigration, /REVOKE\s+ALL\s+ON\s+TABLE\s+clinical_alerts\s+FROM\s+authenticated/i);
  assert.match(
    clinicalLedgerMigration,
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+clinical_alerts_source_occurrence_uidx[\s\S]*?organization_id,\s*dedupe_key,\s*occurrence_number/i,
  );
  assert.match(
    clinicalLedgerMigration,
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+clinical_alerts_one_active_source_uidx[\s\S]*?WHERE\s+status\s+IN\s*\('open',\s*'acknowledged'\)/i,
  );
  assert.match(clinicalLedgerMigration, /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+clinical_alerts_organization_id_dedupe_key_key/i);
  const occurredAtUpgradeAddIndex = clinicalLedgerMigration.indexOf(
    "ADD COLUMN IF NOT EXISTS occurred_at timestamptz",
  );
  const occurredAtBackfillIndex = clinicalLedgerMigration.indexOf(
    "UPDATE clinical_alerts",
    occurredAtUpgradeAddIndex,
  );
  const occurredAtFinalizeIndex = clinicalLedgerMigration.indexOf(
    "ALTER COLUMN occurred_at SET DEFAULT now()",
    occurredAtBackfillIndex,
  );
  assert.ok(
    occurredAtUpgradeAddIndex >= 0 &&
      occurredAtBackfillIndex > occurredAtUpgradeAddIndex &&
      occurredAtFinalizeIndex > occurredAtBackfillIndex,
    "occurred_at upgrade must add nullable, backfill, then finalize constraints",
  );
  const occurredAtNullableAdd = clinicalLedgerMigration.slice(
    occurredAtUpgradeAddIndex,
    occurredAtBackfillIndex,
  );
  assert.match(occurredAtNullableAdd, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+occurred_at\s+timestamptz\s*;/i);
  assert.doesNotMatch(occurredAtNullableAdd, /occurred_at\s+timestamptz\s+(?:NOT\s+NULL|DEFAULT)/i);
  assert.match(
    clinicalLedgerMigration.slice(occurredAtBackfillIndex, occurredAtFinalizeIndex),
    /UPDATE\s+clinical_alerts\s+SET\s+occurred_at\s*=\s*COALESCE\(occurred_at,\s*created_at,\s*updated_at,\s*now\(\)\)\s+WHERE\s+occurred_at\s+IS\s+NULL\s*;/i,
  );
  assert.match(
    clinicalLedgerMigration.slice(occurredAtFinalizeIndex),
    /ALTER\s+COLUMN\s+occurred_at\s+SET\s+DEFAULT\s+now\(\)[\s\S]*?ALTER\s+COLUMN\s+occurred_at\s+SET\s+NOT\s+NULL/i,
  );

  const scanAudioUploadMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "030_scan_audio_upload_idempotency.sql"),
    "utf8",
  );
  assert.match(scanAudioUploadMigration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+scan_audio_chunks/i);
  assert.match(scanAudioUploadMigration, /UNIQUE\s*\(scan_id,\s*chunk_sequence\)/i);
  assert.match(scanAudioUploadMigration, /UNIQUE\s*\(organization_id,\s*actor_user_id,\s*idempotency_key\)/i);
  assert.match(scanAudioUploadMigration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+scan_audio_completions/i);
  assert.match(scanAudioUploadMigration, /ALTER\s+TABLE\s+scan_audio_chunks\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(scanAudioUploadMigration, /ALTER\s+TABLE\s+scan_audio_completions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  const uploadCounterAddIndex = scanAudioUploadMigration.indexOf("ADD COLUMN IF NOT EXISTS uploaded_bytes bigint");
  const uploadCounterBackfillIndex = scanAudioUploadMigration.indexOf("UPDATE scan_sessions", uploadCounterAddIndex);
  const uploadCounterFinalizeIndex = scanAudioUploadMigration.indexOf("ALTER COLUMN uploaded_bytes SET DEFAULT 0", uploadCounterBackfillIndex);
  assert.ok(
    uploadCounterAddIndex >= 0 &&
      uploadCounterBackfillIndex > uploadCounterAddIndex &&
      uploadCounterFinalizeIndex > uploadCounterBackfillIndex,
    "scan upload counters must be added nullable, backfilled, then finalized",
  );

  const crossTenantAudioGraph = baseGraph({
    organizations: [
      { id: "org_identity", name: "Identity Clinic", type: "clinic" },
      { id: "org_other", name: "Other Clinic", type: "clinic" },
    ],
    scans: [{
      id: "scan_audio_tenant",
      organizationId: "org_identity",
      patientId: "patient_self",
      createdByUserId: "user_patient",
      status: "uploading",
    }],
    scanAudioChunks: [{
      id: "chunk_cross_tenant",
      scanId: "scan_audio_tenant",
      organizationId: "org_other",
      actorUserId: "user_patient",
      idempotencyKey: "chunk-cross-tenant",
      sequence: 0,
      sha256: "a".repeat(64),
      byteSize: 4,
      filePath: "scan_audio_tenant/00000000.pcm",
    }],
    scanAudioCompletions: [{
      id: "completion_cross_tenant",
      scanId: "scan_audio_tenant",
      organizationId: "org_other",
      actorUserId: "user_patient",
      idempotencyKey: "completion-cross-tenant",
      status: "completed",
      manifestSha256: "b".repeat(64),
      chunkCount: 1,
      totalBytes: 4,
    }],
  });
  assert.throws(
    () => validateAndNormalizeImportGraph(crossTenantAudioGraph),
    (error) => {
      const issueCodes = new Set(error.details?.issues?.map((issue) => issue.code));
      return (
        error.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
        issueCodes.has("IMPORT_SCAN_AUDIO_CHUNK_TENANT_MISMATCH") &&
        issueCodes.has("IMPORT_SCAN_AUDIO_COMPLETION_TENANT_MISMATCH")
      );
    },
    "scan audio import rows must belong to the same workspace as their scan",
  );

  const oversizedAudioGraph = baseGraph({
    scans: [{
      id: "scan_audio_oversized",
      organizationId: "org_identity",
      patientId: "patient_self",
      createdByUserId: "user_patient",
      status: "uploading",
    }],
    scanAudioChunks: [{
      id: "chunk_oversized",
      scanId: "scan_audio_oversized",
      organizationId: "org_identity",
      actorUserId: "user_patient",
      idempotencyKey: "chunk-oversized",
      sequence: 0,
      sha256: "a".repeat(64),
      byteSize: 1024 * 1024 + 1,
      filePath: "scan_audio_oversized/00000000.pcm",
    }],
    scanAudioCompletions: [{
      id: "completion_oversized",
      scanId: "scan_audio_oversized",
      organizationId: "org_identity",
      actorUserId: "user_patient",
      idempotencyKey: "completion-oversized",
      status: "completed",
      manifestSha256: "b".repeat(64),
      chunkCount: 32769,
      totalBytes: 32 * 1024 * 1024 + 1,
    }],
  });
  assert.throws(
    () => validateAndNormalizeImportGraph(oversizedAudioGraph),
    (error) => {
      const issueCodes = new Set(error.details?.issues?.map((issue) => issue.code));
      return (
        error.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
        issueCodes.has("IMPORT_SCAN_AUDIO_CHUNK_SIZE_INVALID") &&
        issueCodes.has("IMPORT_SCAN_AUDIO_COMPLETION_LIMIT_INVALID")
      );
    },
    "scan audio import rows must obey the production byte and chunk limits",
  );

  const scanAudioTenantMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "031_scan_audio_upload_tenant_limits.sql"),
    "utf8",
  );
  assert.match(scanAudioTenantMigration, /UNIQUE\s*\(id,\s*organization_id\)/i);
  assert.match(
    scanAudioTenantMigration,
    /FOREIGN\s+KEY\s*\(scan_id,\s*organization_id\)\s+REFERENCES\s+scan_sessions\s*\(id,\s*organization_id\)/i,
  );
  assert.match(scanAudioTenantMigration, /CHECK\s*\(byte_size\s*<=\s*1048576\)/i);
  assert.match(scanAudioTenantMigration, /CHECK\s*\(uploaded_bytes\s*<=\s*33554432\)/i);

  const audioProcessingIntentMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "032_audio_processing_intent.sql"),
    "utf8",
  );
  assert.match(audioProcessingIntentMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+processing_generation\s+bigint/i);
  assert.match(audioProcessingIntentMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+processing_artifact_fingerprint\s+text/i);
  assert.match(audioProcessingIntentMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+processing_run_id\s+text/i);
  assert.match(audioProcessingIntentMigration, /UPDATE\s+scan_sessions[\s\S]*processing_generation\s*=\s*COALESCE/i);
  assert.match(audioProcessingIntentMigration, /ALTER\s+COLUMN\s+processing_generation\s+SET\s+NOT\s+NULL/i);

  const notificationDeviceOwnershipMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "033_notification_device_token_ownership.sql"),
    "utf8",
  );
  assert.match(notificationDeviceOwnershipMigration, /PARTITION\s+BY\s+fcm_token/i);
  assert.match(notificationDeviceOwnershipMigration, /token_rank\s*>\s*1/i);
  assert.match(
    notificationDeviceOwnershipMigration,
    /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+notification_devices_user_id_fcm_token_key/i,
  );
  assert.match(
    notificationDeviceOwnershipMigration,
    /CREATE\s+UNIQUE\s+INDEX[\s\S]*ON\s+notification_devices\s*\(fcm_token\)/i,
  );

  const workspaceMembershipLifecycleMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "034_workspace_membership_lifecycle.sql"),
    "utf8",
  );
  assert.match(workspaceMembershipLifecycleMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+status\s+text/i);
  assert.match(workspaceMembershipLifecycleMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+suspended_at\s+timestamptz/i);
  assert.match(workspaceMembershipLifecycleMigration, /CHECK\s*\(status\s+IN\s*\('active',\s*'suspended'\)\)/i);
  assert.match(
    workspaceMembershipLifecycleMigration,
    /CREATE\s+INDEX[\s\S]*memberships\s*\(organization_id,\s*status,\s*role\)/i,
  );

  const secureJsonExportsMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "035_secure_json_exports.sql"),
    "utf8",
  );
  assert.match(secureJsonExportsMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+organization_id\s+text/i);
  assert.match(secureJsonExportsMigration, /REFERENCES\s+organizations\s*\(id\)/i);
  assert.match(secureJsonExportsMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+created_by_user_id\s+text/i);
  assert.match(secureJsonExportsMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+start_date\s+date/i);
  assert.match(secureJsonExportsMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+end_date\s+date/i);
  assert.match(
    secureJsonExportsMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+snapshot_json\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'::jsonb/i,
  );
  assert.match(
    secureJsonExportsMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+artifact_byte_size\s+bigint\s+NOT\s+NULL\s+DEFAULT\s+0/i,
  );
  assert.match(secureJsonExportsMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+downloaded_at\s+timestamptz/i);
  assert.match(secureJsonExportsMigration, /ALTER\s+COLUMN\s+format\s+SET\s+DEFAULT\s+'json'/i);
  assert.match(secureJsonExportsMigration, /ALTER\s+COLUMN\s+status\s+SET\s+DEFAULT\s+'pending'/i);
  assert.match(
    secureJsonExportsMigration,
    /UPDATE\s+exports[\s\S]*SET\s+status\s*=\s*'failed'[\s\S]*WHERE\s+status\s*=\s*'ready'[\s\S]*snapshot_json/i,
    "legacy ready rows without a bound snapshot must fail closed",
  );
  assert.match(
    secureJsonExportsMigration,
    /CREATE\s+INDEX[\s\S]*exports\s*\(organization_id,\s*created_at\s+DESC\)/i,
  );
  assert.match(
    secureJsonExportsMigration,
    /CREATE\s+INDEX[\s\S]*exports\s*\(created_by_user_id,\s*created_at\s+DESC\)/i,
  );

  const multiFormatExportsMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "043_multi_format_exports.sql"),
    "utf8",
  );
  assert.match(
    multiFormatExportsMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+artifact_sha256\s+text\s+NOT\s+NULL\s+DEFAULT\s+''/i,
  );
  assert.match(
    multiFormatExportsMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+renderer_version\s+text\s+NOT\s+NULL\s+DEFAULT\s+'shcare\.export-artifact\.v1'/i,
  );
  assert.match(
    multiFormatExportsMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+dataset\s+text\s+NOT\s+NULL\s+DEFAULT\s+'clinical_bundle'/i,
  );
  assert.match(
    multiFormatExportsMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+scope_kind\s+text\s+NOT\s+NULL\s+DEFAULT\s+'workspace'/i,
  );
  assert.match(
    multiFormatExportsMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+filters_json\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'::jsonb/i,
  );
  assert.match(
    multiFormatExportsMigration,
    /CREATE\s+INDEX[\s\S]*exports\s*\(organization_id,\s*format,\s*created_at\s+DESC\)/i,
  );

  const importedExportSnapshot = {
    schemaVersion: "shcare.export.v1",
    exportId: "export_import_csv",
    dataset: "clinical_bundle",
    generatedAt: "2026-07-23T00:00:00.000Z",
    scope: {
      organizationId: "org_identity",
      kind: "workspace",
      actorUserId: "user_patient",
      patientIds: [],
    },
    filters: {
      startDate: "",
      endDate: "",
      includeAudio: false,
      includeReports: false,
      includeHistory: false,
    },
    counts: {
      patients: 0,
      devices: 0,
      scans: 0,
      appointments: 0,
      reports: 0,
      audioFiles: 0,
      total: 0,
    },
    data: {
      patients: [],
      devices: [],
      scans: [],
      appointments: [],
      reports: [],
      audioFiles: [],
    },
  };
  const expectedImportedArtifact = await buildExportArtifact(
    importedExportSnapshot,
    "csv",
    EXPORT_ARTIFACT_RENDERER_VERSION,
  );
  const expectedImportedArtifactHash = crypto
    .createHash("sha256")
    .update(expectedImportedArtifact.buffer)
    .digest("hex");
  const exportImportWrites = [];
  const importedExport = await insertExportJob({
    async query(sql, params) {
      exportImportWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: importedExportSnapshot.exportId,
    organizationId: "org_identity",
    createdByUserId: "user_patient",
    format: "csv",
    dataset: "clinical_bundle",
    scopeKind: "workspace",
    filters: importedExportSnapshot.filters,
    rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
    status: "ready",
    snapshot: importedExportSnapshot,
    artifactByteSize: 1,
    artifactSha256: "legacy-untrusted-hash",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.equal(importedExport.state, "inserted");
  const exportInsert = exportImportWrites.find((write) => /INSERT\s+INTO\s+exports/i.test(write.sql));
  assert.ok(exportInsert);
  assert.equal(exportInsert.params[3], "csv");
  assert.equal(exportInsert.params[4], "clinical_bundle");
  assert.equal(exportInsert.params[5], "workspace");
  assert.deepEqual(JSON.parse(exportInsert.params[6]), importedExportSnapshot.filters);
  assert.equal(exportInsert.params[7], EXPORT_ARTIFACT_RENDERER_VERSION);
  assert.equal(exportInsert.params[8], "ready");
  assert.equal(exportInsert.params[17], expectedImportedArtifact.buffer.length);
  assert.equal(exportInsert.params[18], expectedImportedArtifactHash);

  const platformGlobalAuditSnapshot = {
    schemaVersion: "shcare.export.v1",
    exportId: "export_import_platform_global_audit",
    dataset: "audit_logs",
    generatedAt: "2026-07-23T00:00:00.000Z",
    scope: {
      organizationId: "",
      workspaceId: "",
      kind: "platform",
      actorUserId: "user_patient",
      patientIds: [],
    },
    filters: { action: "export.create", sort: "createdAt:desc" },
    counts: { auditLogs: 0, total: 0 },
    data: { auditLogs: [] },
  };
  const platformGlobalAuditWrites = [];
  const importedPlatformGlobalAudit = await insertExportJob({
    async query(sql, params) {
      platformGlobalAuditWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: platformGlobalAuditSnapshot.exportId,
    organizationId: "",
    createdByUserId: "user_patient",
    format: "json",
    dataset: "audit_logs",
    scopeKind: "platform",
    rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
    status: "ready",
    snapshot: platformGlobalAuditSnapshot,
  });
  assert.equal(importedPlatformGlobalAudit.state, "inserted");
  const platformGlobalAuditInsert = platformGlobalAuditWrites.find((write) =>
    /INSERT\s+INTO\s+exports/i.test(write.sql));
  assert.equal(platformGlobalAuditInsert.params[1], null, "global audit scope must persist SQL organization_id as NULL");
  assert.equal(platformGlobalAuditInsert.params[4], "audit_logs");
  assert.equal(platformGlobalAuditInsert.params[5], "platform");
  assert.equal(platformGlobalAuditInsert.params[8], "ready");
  assert.deepEqual(JSON.parse(platformGlobalAuditInsert.params[16]), platformGlobalAuditSnapshot);
  assert.match(platformGlobalAuditInsert.params[18], /^[0-9a-f]{64}$/);

  const invalidSnapshotWrites = [];
  const invalidSnapshotImport = await insertExportJob({
    async query(sql, params) {
      invalidSnapshotWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "export_import_invalid",
    organizationId: "org_identity",
    createdByUserId: "user_patient",
    format: "pdf",
    status: "ready",
    snapshot: { exportId: "wrong-export", scope: { organizationId: "org_identity" } },
  });
  assert.equal(invalidSnapshotImport.state, "inserted");
  const invalidSnapshotInsert = invalidSnapshotWrites.find((write) => /INSERT\s+INTO\s+exports/i.test(write.sql));
  assert.equal(invalidSnapshotInsert.params[8], "failed", "an unbound legacy snapshot must fail closed");
  assert.deepEqual(JSON.parse(invalidSnapshotInsert.params[16]), {});
  assert.equal(invalidSnapshotInsert.params[17], 0);
  assert.equal(invalidSnapshotInsert.params[18], "");

  for (const mismatchCase of [
    {
      id: "export_import_dataset_mismatch",
      dataset: "audit_logs",
      scopeKind: "workspace",
      rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
      snapshotDataset: "clinical_bundle",
      snapshotScopeKind: "workspace",
    },
    {
      id: "export_import_scope_mismatch",
      dataset: "clinical_bundle",
      scopeKind: "personal",
      rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
      snapshotDataset: "clinical_bundle",
      snapshotScopeKind: "workspace",
    },
    {
      id: "export_import_renderer_unavailable",
      dataset: "clinical_bundle",
      scopeKind: "workspace",
      rendererVersion: "shcare.export-artifact.v0",
      snapshotDataset: "clinical_bundle",
      snapshotScopeKind: "workspace",
    },
    {
      id: "export_import_scope_unknown",
      dataset: "clinical_bundle",
      scopeKind: "cross_tenant_dump",
      rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
      snapshotDataset: "clinical_bundle",
      snapshotScopeKind: "cross_tenant_dump",
    },
  ]) {
    const mismatchWrites = [];
    const mismatchSnapshot = {
      ...structuredClone(importedExportSnapshot),
      exportId: mismatchCase.id,
      dataset: mismatchCase.snapshotDataset,
      scope: {
        ...importedExportSnapshot.scope,
        kind: mismatchCase.snapshotScopeKind,
      },
    };
    const mismatchImport = await insertExportJob({
      async query(sql, params) {
        mismatchWrites.push({ sql, params });
        if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ id: params[0] }] };
      },
    }, {
      id: mismatchCase.id,
      organizationId: "org_identity",
      createdByUserId: "user_patient",
      format: "json",
      dataset: mismatchCase.dataset,
      scopeKind: mismatchCase.scopeKind,
      rendererVersion: mismatchCase.rendererVersion,
      status: "ready",
      snapshot: mismatchSnapshot,
    });
    assert.equal(mismatchImport.state, "inserted");
    const mismatchInsert = mismatchWrites.find((write) => /INSERT\s+INTO\s+exports/i.test(write.sql));
    assert.equal(mismatchInsert.params[8], "failed", `${mismatchCase.id} must fail closed`);
    assert.deepEqual(JSON.parse(mismatchInsert.params[16]), {});
    assert.equal(mismatchInsert.params[17], 0);
    assert.equal(mismatchInsert.params[18], "");
  }

  await assert.rejects(
    insertExportJob({
      async query(sql) {
        if (/^\s*SELECT/i.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              id: importedExportSnapshot.exportId,
              organization_id: "org_other",
              created_by_user_id: "user_patient",
              artifact_sha256: expectedImportedArtifactHash,
            }],
          };
        }
        throw new Error("conflicting export must not reach INSERT");
      },
    }, {
      id: importedExportSnapshot.exportId,
      organizationId: "org_identity",
      createdByUserId: "user_patient",
      format: "csv",
      snapshot: importedExportSnapshot,
    }),
    (error) =>
      error?.code === "IMPORT_EXPORT_CANONICAL_CONFLICT" &&
      error?.details?.mismatchFields?.includes("organizationId"),
  );
  await assert.rejects(
    insertExportJob({
      async query(sql) {
        if (/^\s*SELECT/i.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              id: importedExportSnapshot.exportId,
              organization_id: "org_identity",
              created_by_user_id: "user_patient",
              dataset: "audit_logs",
              scope_kind: "personal",
              renderer_version: "shcare.export-artifact.v0",
              artifact_sha256: expectedImportedArtifactHash,
            }],
          };
        }
        throw new Error("conflicting export metadata must not reach INSERT");
      },
    }, {
      id: importedExportSnapshot.exportId,
      organizationId: "org_identity",
      createdByUserId: "user_patient",
      format: "csv",
      dataset: "clinical_bundle",
      scopeKind: "workspace",
      rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
      snapshot: importedExportSnapshot,
    }),
    (error) =>
      error?.code === "IMPORT_EXPORT_CANONICAL_CONFLICT" &&
      ["dataset", "scopeKind", "rendererVersion"].every((field) =>
        error?.details?.mismatchFields?.includes(field)),
  );

  const patientAccessAuthorityTypeMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "036_patient_access_authority_type.sql"),
    "utf8",
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+authority_type\s+text/i,
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+purpose\s+text\s+NOT\s+NULL\s+DEFAULT\s+''/i,
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+consented_at\s+timestamptz/i,
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /granted_by_user_id\s+IN\s*\([\s\S]*patient\.owner_user_id[\s\S]*patient\.account_user_id[\s\S]*patient\.guardian_user_id/i,
    "legacy rows may be called patient consent only when the grantor owns or guards the profile",
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /JOIN\s+users\s+grantor[\s\S]*grantor\.role\s*=\s*'patient'/i,
    "legacy patient consent backfill must also require a patient-role grantor",
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /authority_type\s+IN\s*\([\s\S]*'patient_consent'[\s\S]*'clinician_access_grant'[\s\S]*'administrative_assignment'/i,
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /authority_type\s*=\s*'patient_consent'\s+AND\s+consented_at\s+IS\s+NOT\s+NULL/i,
  );
  assert.match(
    patientAccessAuthorityTypeMigration,
    /CREATE\s+INDEX[\s\S]*doctor_patient_access\s*\(patient_id,\s*authority_type,\s*revoked_at,\s*expires_at\)/i,
  );

  const staffInvitationMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "039_staff_invitations.sql"),
    "utf8",
  );
  assert.match(staffInvitationMigration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+staff_invitations/i);
  assert.match(staffInvitationMigration, /token_hash\s+text\s+NOT\s+NULL\s+UNIQUE/i);
  assert.doesNotMatch(staffInvitationMigration, /\btoken\s+text\b/i);
  assert.match(
    staffInvitationMigration,
    /CREATE\s+UNIQUE\s+INDEX[\s\S]*staff_invitations\s*\(organization_id,\s*lower\(email\)\)[\s\S]*WHERE\s+status\s*=\s*'pending'/i,
  );
  assert.match(staffInvitationMigration, /ALTER\s+TABLE\s+staff_invitations\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);

  const invitationWrites = [];
  const importedInvitation = await insertStaffInvitation({
    async query(sql, params) {
      invitationWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "staff_invitation_import",
    organizationId: "org_identity",
    email: "doctor-invite@example.test",
    role: "doctor",
    name: "Imported Doctor",
    status: "pending",
    tokenHash: "c".repeat(64),
    expiresAt: "2026-07-26T00:00:00.000Z",
    delivery: { email: "unavailable", provider: "brevo" },
    createdByUserId: "user_patient",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  });
  assert.equal(importedInvitation.state, "inserted");
  const invitationInsert = invitationWrites.find((write) => /INSERT\s+INTO\s+staff_invitations/i.test(write.sql));
  assert.ok(invitationInsert);
  assert.match(invitationInsert.sql, /token_hash/i);
  assert.doesNotMatch(invitationInsert.sql, /\btoken\s*,/i);
  assert.equal(invitationInsert.params.includes("c".repeat(64)), true);

  const patientImportBatch = {
    id: "patient_import_batch_migration",
    organizationId: "org_identity",
    actorUserId: "user_patient",
    fileName: "patients.csv",
    fileSizeBytes: 256,
    fileSha256: "d".repeat(64),
    status: "committed",
    rowCount: 1,
    validCount: 1,
    invalidCount: 0,
    duplicateCount: 0,
    rows: [{
      rowNumber: 2,
      status: "valid",
      issues: [],
      patient: { id: "patient_self", organizationId: "org_identity", name: "Imported Patient" },
    }],
    patientIds: ["patient_self"],
    importedCount: 1,
    version: 2,
    expiresAt: "2026-07-24T00:00:00.000Z",
    committedAt: "2026-07-23T00:00:00.000Z",
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
  const importBatchGraph = baseGraph({
    organizations: [{ id: "org_identity", name: "Identity Clinic", type: "clinic", status: "pending" }],
    patientImportBatches: [structuredClone(patientImportBatch)],
  });
  normalizeLegacyPatientIdentityGraph(importBatchGraph);
  validateAndNormalizeImportGraph(importBatchGraph);
  assert.equal(importBatchGraph.patientImportBatches[0].status, "committed");
  const missingImportedPatientGraph = baseGraph({
    organizations: [{ id: "org_identity", name: "Identity Clinic", type: "clinic", status: "pending" }],
    patientImportBatches: [{
      ...structuredClone(patientImportBatch),
      patientIds: ["patient_missing"],
    }],
  });
  normalizeLegacyPatientIdentityGraph(missingImportedPatientGraph);
  assert.throws(
    () => validateAndNormalizeImportGraph(missingImportedPatientGraph),
    (error) =>
      error?.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error?.details?.issues?.some((issue) =>
        issue.entityType === "patient_import_batch" && issue.referencedId === "patient_missing"),
  );

  const patientImportWrites = [];
  const importedPatientBatch = await insertPatientImportBatch({
    async query(sql, params) {
      patientImportWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, patientImportBatch);
  assert.equal(importedPatientBatch.state, "inserted");
  const patientImportInsert = patientImportWrites.find((write) =>
    /INSERT\s+INTO\s+patient_import_batches/i.test(write.sql));
  assert.ok(patientImportInsert);
  assert.equal(patientImportInsert.params[0], patientImportBatch.id);
  assert.equal(patientImportInsert.params[1], patientImportBatch.organizationId);
  assert.deepEqual(JSON.parse(patientImportInsert.params[12]), ["patient_self"]);

  const patientImportMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "042_patient_import_batches.sql"),
    "utf8",
  );
  assert.match(patientImportMigration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+patient_import_batches/i);
  assert.match(patientImportMigration, /organization_id\s+text\s+NOT\s+NULL\s+REFERENCES\s+organizations/i);
  assert.match(patientImportMigration, /CHECK\s*\(status\s+IN\s*\('validated',\s*'invalid',\s*'committed',\s*'expired'\)\)/i);

  const chunkWrites = [];
  const importedChunk = await upsertScanAudioChunk({
    async query(sql, params) {
      chunkWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "chunk_import",
    scanId: "scan_import",
    organizationId: "org_identity",
    actorUserId: "user_patient",
    idempotencyKey: "chunk-import-key",
    sequence: 0,
    sha256: "a".repeat(64),
    byteSize: 4,
    filePath: "scan_import/00000000.pcm",
  });
  assert.equal(importedChunk.state, "inserted");
  assert.match(
    chunkWrites.find((write) => /INSERT\s+INTO\s+scan_audio_chunks/i.test(write.sql)).sql,
    /ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i,
  );

  const completionWrites = [];
  const importedCompletion = await upsertScanAudioCompletion({
    async query(sql, params) {
      completionWrites.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0] }] };
    },
  }, {
    id: "completion_import",
    scanId: "scan_import",
    organizationId: "org_identity",
    actorUserId: "user_patient",
    idempotencyKey: "completion-import-key",
    status: "completed",
    manifestSha256: "b".repeat(64),
    chunkCount: 1,
    totalBytes: 4,
    response: { scan: { id: "scan_import", status: "completed" } },
  });
  assert.equal(importedCompletion.state, "inserted");
  assert.match(
    completionWrites.find((write) => /INSERT\s+INTO\s+scan_audio_completions/i.test(write.sql)).sql,
    /ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i,
  );

  const importerSource = fs.readFileSync(path.join(__dirname, "migrateJsonToPostgres.js"), "utf8");
  const importerMainIndex = importerSource.indexOf("async function main()");
  const sourcePreflightIndex = importerSource.indexOf("normalizeLegacyPatientIdentityGraph(db);", importerMainIndex);
  const referencePreflightIndex = importerSource.indexOf("validateAndNormalizeImportGraph(db);", importerMainIndex);
  const databaseConnectionIndex = importerSource.indexOf("new Client({ connectionString: databaseUrl })");
  assert.ok(sourcePreflightIndex >= 0 && sourcePreflightIndex < databaseConnectionIndex,
    "source identity preflight must happen before any database connection or schema mutation");
  assert.ok(referencePreflightIndex >= 0 && referencePreflightIndex < databaseConnectionIndex,
    "source reference preflight must happen before any database connection or schema mutation");
  assert.doesNotMatch(
    importerSource.slice(importerMainIndex),
    /organizationId:\s*(?:patient|device|scan)\.organizationId\s*\|\|\s*"org_default_clinic"/,
    "missing tenant identities must not be silently moved into the default workspace",
  );
  assert.match(importerSource.slice(importerMainIndex), /scanReviews:\s*createImportCounter\(\)/);
  assert.match(importerSource.slice(importerMainIndex), /clinicalAlerts:\s*createImportCounter\(\)/);
  assert.match(importerSource.slice(importerMainIndex), /scanAudioChunks:\s*createImportCounter\(\)/);
  assert.match(importerSource.slice(importerMainIndex), /scanAudioCompletions:\s*createImportCounter\(\)/);
  assert.match(importerSource.slice(importerMainIndex), /patientImportBatches:\s*createImportCounter\(\)/);
  assert.match(importerSource.slice(importerMainIndex), /exports:\s*createImportCounter\(\)/);
  const patientImportCallIndex = importerSource.indexOf("insertPatientImportBatch(client, batch)", importerMainIndex);
  const patientImportPatientCallIndex = importerSource.indexOf("upsertPatient(client, patient)", importerMainIndex);
  assert.ok(
    patientImportCallIndex > patientImportPatientCallIndex,
    "patient import batches must be imported after their committed patient references",
  );
  const scanImportCallIndex = importerSource.indexOf("upsertScan(client, scan)", importerMainIndex);
  const chunkImportCallIndex = importerSource.indexOf("upsertScanAudioChunk(client, chunk)", importerMainIndex);
  const completionImportCallIndex = importerSource.indexOf("upsertScanAudioCompletion(client, completion)", importerMainIndex);
  const scanReviewImportCallIndex = importerSource.indexOf("upsertScanReview(client, review)", importerMainIndex);
  const clinicalAlertImportCallIndex = importerSource.indexOf("upsertClinicalAlert(client, alert)", importerMainIndex);
  const exportImportCallIndex = importerSource.indexOf("insertExportJob(client, exportJob)", importerMainIndex);
  const auditImportCallIndex = importerSource.indexOf("insertAuditLog(client, log)", importerMainIndex);
  assert.ok(
    scanImportCallIndex >= 0 && scanReviewImportCallIndex > scanImportCallIndex,
    "scan review ledger rows must be imported after their canonical scans",
  );
  assert.ok(
    chunkImportCallIndex > scanImportCallIndex && completionImportCallIndex > chunkImportCallIndex,
    "audio chunks and completion must be imported after their canonical scan in ledger order",
  );
  assert.ok(
    clinicalAlertImportCallIndex > scanImportCallIndex,
    "clinical alert ledger rows must be imported after their canonical scan/device sources",
  );
  assert.ok(
    exportImportCallIndex > scanImportCallIndex && auditImportCallIndex > exportImportCallIndex,
    "immutable export jobs must be imported after clinical source records and before audit receipts",
  );
  assert.match(
    importerSource,
    /async\s+function\s+insertExportJob[\s\S]*?snapshot\.exportId\s*===\s*id[\s\S]*?snapshot\.scope\?\.organizationId\s*===\s*organizationId/i,
    "legacy export snapshots must remain bound to their canonical job and workspace",
  );
  assert.match(
    importerSource,
    /async\s+function\s+insertExportJob[\s\S]*?buildExportArtifact\(snapshot,\s*format,\s*rendererVersion\)[\s\S]*?createHash\("sha256"\)/i,
    "import must regenerate deterministic artifact metadata instead of trusting legacy size/hash fields",
  );
  assert.match(
    importerSource,
    /IMPORT_EXPORT_CANONICAL_CONFLICT[\s\S]*?mismatchFields/i,
    "a duplicate export id with a different canonical scope or hash must fail reconciliation",
  );
  assert.match(
    importerSource.slice(importerMainIndex),
    /clinicalAlerts[\s\S]*?\.sort\([\s\S]*?occurrenceNumber[\s\S]*?upsertClinicalAlert\(client,\s*alert\)/,
    "alert occurrences must be imported oldest-first so previousAlertId foreign keys are available",
  );
  assert.match(importerSource, /Migration JSON -> PostgreSQL đã đối soát:/);

  const bundledDb = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "db.json"), "utf8"));
  assert.doesNotThrow(() => normalizeLegacyPatientIdentityGraph(bundledDb));
  const remediatedBundledPatient = bundledDb.patients.find(
    (patient) => patient.id === "pat_20260523210428_eb7affd2",
  );
  assert.equal(remediatedBundledPatient.organizationId, "vn_hospital_quan_y_175");
  assert.equal(remediatedBundledPatient.ownerUserId, "usr_20260526062020_05a18dfc");
  assert.equal(remediatedBundledPatient.accountUserId, "usr_20260526062020_05a18dfc");
  console.log("Identity migration/import smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
