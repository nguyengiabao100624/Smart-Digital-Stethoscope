const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  generateStaffInvitationToken,
  hashStaffInvitationToken,
  normalizeStaffInvitationCreate,
  publicStaffInvitation,
} = require("../src/staffInvitationContract");
const { createStaffInvitationRepository } = require("../src/staffInvitationRepository");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createIdFactory() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}

function createRuntimeDb() {
  const createdAt = "2026-07-19T00:00:00.000Z";
  return {
    organizations: [
      { id: "org_alpha", name: "Alpha Clinic", status: "active" },
      { id: "org_beta", name: "Beta Hospital", status: "active" },
    ],
    users: [
      {
        id: "user_owner",
        email: "owner@alpha.test",
        name: "Owner",
        role: "workspace_owner",
        requestedRole: "workspace_owner",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_alpha",
      },
      {
        id: "user_invited",
        email: "invitee@alpha.test",
        name: "Invitee",
        role: "patient",
        requestedRole: "patient",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_beta",
      },
      {
        id: "user_wrong",
        email: "wrong@alpha.test",
        name: "Wrong Person",
        role: "patient",
        requestedRole: "patient",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_beta",
      },
    ],
    memberships: [
      {
        id: "membership_owner",
        organizationId: "org_alpha",
        userId: "user_owner",
        role: "workspace_owner",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    staffInvitations: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
}

function idempotency(operation, key, fingerprint) {
  return {
    scope: "workspace:org_alpha",
    operation,
    key,
    fingerprint,
  };
}

function audit(action, actorUserId = "user_owner") {
  return {
    action,
    actorUserId,
    organizationId: "org_alpha",
    ip: "127.0.0.1",
    userAgent: "staff-invitation-test",
  };
}

function invitationIntent(overrides = {}) {
  const token = overrides.token || generateStaffInvitationToken();
  return {
    token,
    input: {
      payload: {
        organizationId: "org_alpha",
        email: "invitee@alpha.test",
        role: "doctor",
        name: "Invited Doctor",
        specialty: "Cardiology",
        license: "LIC-100",
        ...overrides.payload,
      },
      tokenHash: hashStaffInvitationToken(token),
      expiresAt: overrides.expiresAt || "2026-07-26T00:00:00.000Z",
      deliveryEmail: overrides.deliveryEmail || "unavailable",
      idempotency:
        overrides.idempotency ||
        idempotency("staff.invitation.create", "invite-create", "invite-create-v1"),
      audit: audit("staff.invitation.create"),
    },
  };
}

test("staff invitation contract validates roles and never exposes token hashes", () => {
  assert.throws(
    () => normalizeStaffInvitationCreate({ organizationId: "org_alpha", email: "bad", role: "doctor" }),
    (error) => error.code === "STAFF_INVITATION_EMAIL_INVALID",
  );
  assert.throws(
    () =>
      normalizeStaffInvitationCreate({
        organizationId: "org_alpha",
        email: "doctor@example.com",
        role: "workspace_owner",
      }),
    (error) => error.code === "STAFF_INVITATION_ROLE_INVALID",
  );
  const token = generateStaffInvitationToken();
  assert.ok(token.length >= 32);
  assert.match(hashStaffInvitationToken(token), /^[a-f0-9]{64}$/);
  const invitation = publicStaffInvitation({
    id: "invite_1",
    organizationId: "org_alpha",
    email: "doctor@example.com",
    role: "doctor",
    status: "pending",
    tokenHash: hashStaffInvitationToken(token),
    delivery: { email: "unavailable" },
    expiresAt: "2026-07-26T00:00:00.000Z",
  });
  assert.equal(Object.hasOwn(invitation, "tokenHash"), false);
  assert.equal(JSON.stringify(invitation).includes(token), false);
});

test("JSON invitation lifecycle is tenant scoped, idempotent and acceptance is audit atomic", async () => {
  const db = createRuntimeDb();
  let saves = 0;
  const repository = createStaffInvitationRepository({
    getDb: () => db,
    saveDb: async () => {
      saves += 1;
    },
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });

  const intent = invitationIntent();
  const created = await repository.create(intent.input);
  assert.equal(created.responseStatus, 201);
  assert.equal(created.responseBody.invitation.status, "pending");
  assert.equal(created.responseBody.invitation.delivery.email, "unavailable");
  assert.equal(JSON.stringify(db).includes(intent.token), false, "raw invitation token must never persist");
  assert.equal(db.staffInvitations[0].tokenHash, hashStaffInvitationToken(intent.token));
  const replay = await repository.create(intent.input);
  assert.equal(replay.replayed, true);
  assert.equal(db.staffInvitations.length, 1);
  await assert.rejects(
    repository.create({
      ...intent.input,
      idempotency: { ...intent.input.idempotency, fingerprint: "invite-create-v2" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const alphaList = await repository.list({ organizationId: "org_alpha" });
  const betaList = await repository.list({ organizationId: "org_beta" });
  assert.deepEqual(alphaList.map((item) => item.id), [created.responseBody.invitation.id]);
  assert.deepEqual(betaList, []);

  const resendToken = generateStaffInvitationToken();
  const resendInput = {
    organizationId: "org_alpha",
    invitationId: created.responseBody.invitation.id,
    tokenHash: hashStaffInvitationToken(resendToken),
    expiresAt: "2026-07-27T00:00:00.000Z",
    deliveryEmail: "ready",
    idempotency: idempotency("staff.invitation.resend", "invite-resend", "invite-resend-v1"),
    audit: audit("staff.invitation.resend"),
  };
  const resent = await repository.resend(resendInput);
  assert.equal(resent.responseBody.invitation.delivery.email, "ready");
  assert.equal(db.staffInvitations[0].tokenHash, hashStaffInvitationToken(resendToken));
  const resendReplay = await repository.resend(resendInput);
  assert.equal(resendReplay.replayed, true);

  await assert.rejects(
    repository.accept({
      organizationId: "org_alpha",
      tokenHash: hashStaffInvitationToken(resendToken),
      actorUserId: "user_wrong",
      actorEmail: "wrong@alpha.test",
      idempotency: idempotency("staff.invitation.accept", "invite-accept-wrong", "accept-wrong-v1"),
      audit: audit("staff.invitation.accept", "user_wrong"),
    }),
    (error) => error.code === "STAFF_INVITATION_EMAIL_MISMATCH",
  );

  const accepted = await repository.accept({
    organizationId: "org_alpha",
    tokenHash: hashStaffInvitationToken(resendToken),
    actorUserId: "user_invited",
    actorEmail: "invitee@alpha.test",
    idempotency: idempotency("staff.invitation.accept", "invite-accept", "accept-v1"),
    audit: audit("staff.invitation.accept", "user_invited"),
  });
  assert.equal(accepted.responseBody.invitation.status, "accepted");
  assert.equal(accepted.responseBody.membership.role, "doctor");
  assert.equal(db.users.find((user) => user.id === "user_invited").role, "doctor");
  assert.equal(db.users.find((user) => user.id === "user_invited").organizationId, "org_alpha");
  assert.equal(db.memberships.filter((item) => item.userId === "user_invited").length, 1);
  const acceptedReplay = await repository.accept({
    organizationId: "org_alpha",
    tokenHash: hashStaffInvitationToken(resendToken),
    actorUserId: "user_invited",
    actorEmail: "invitee@alpha.test",
    idempotency: idempotency("staff.invitation.accept", "invite-accept", "accept-v1"),
    audit: audit("staff.invitation.accept", "user_invited"),
  });
  assert.equal(acceptedReplay.replayed, true);
  assert.equal(db.memberships.filter((item) => item.userId === "user_invited").length, 1);

  assert.equal(db.auditLogs.length, 3);
  assert.equal(db.idempotencyKeys.length, 3);
  assert.ok(saves >= 3);
});

test("revoking a pending invitation never mutates the workspace owner membership", async () => {
  const db = createRuntimeDb();
  const repository = createStaffInvitationRepository({
    getDb: () => db,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });
  const intent = invitationIntent({
    payload: { email: "another@alpha.test", role: "viewer" },
    idempotency: idempotency("staff.invitation.create", "invite-viewer", "invite-viewer-v1"),
  });
  const created = await repository.create(intent.input);
  const revoked = await repository.revoke({
    organizationId: "org_alpha",
    invitationId: created.responseBody.invitation.id,
    reason: "No longer required",
    idempotency: idempotency("staff.invitation.revoke", "invite-revoke", "invite-revoke-v1"),
    audit: audit("staff.invitation.revoke"),
  });
  assert.equal(revoked.responseBody.invitation.status, "revoked");
  assert.equal(db.memberships.length, 1);
  assert.equal(db.memberships[0].id, "membership_owner");
  assert.equal(db.memberships[0].status, "active");
  await assert.rejects(
    repository.accept({
      organizationId: "org_alpha",
      tokenHash: hashStaffInvitationToken(intent.token),
      actorUserId: "user_invited",
      actorEmail: "invitee@alpha.test",
      idempotency: idempotency("staff.invitation.accept", "revoked-accept", "revoked-accept-v1"),
      audit: audit("staff.invitation.accept", "user_invited"),
    }),
    (error) => ["STAFF_INVITATION_NOT_FOUND", "STAFF_INVITATION_NOT_PENDING"].includes(error.code),
  );
});

class FakeStaffInvitationSql {
  constructor() {
    this.state = {
      organizations: [
        { id: "org_alpha", name: "Alpha Clinic", status: "active" },
      ],
      users: [
        {
          id: "user_owner",
          firebase_uid: "",
          email: "owner@alpha.test",
          phone: "",
          role: "workspace_owner",
          name: "Owner",
          license: "",
          hospital: "Alpha Clinic",
          department: "",
          organization_id: "org_alpha",
          patient_id: "",
          verified_email: true,
          verified_phone: false,
          account_status: "active",
          requested_role: "workspace_owner",
          role_request_status: "approved",
          firebase_claims: {},
        },
        {
          id: "user_invited",
          firebase_uid: "",
          email: "invitee@alpha.test",
          phone: "",
          role: "patient",
          name: "Invitee",
          license: "",
          hospital: "",
          department: "",
          organization_id: "org_beta",
          patient_id: "",
          verified_email: true,
          verified_phone: false,
          account_status: "active",
          requested_role: "patient",
          role_request_status: "approved",
          firebase_claims: {},
        },
      ],
      memberships: [
        {
          id: "membership_owner",
          organization_id: "org_alpha",
          user_id: "user_owner",
          role: "workspace_owner",
          status: "active",
          suspended_at: null,
          created_at: "2026-07-19T00:00:00.000Z",
          updated_at: "2026-07-19T00:00:00.000Z",
        },
      ],
      staffInvitations: [],
      auditLogs: [],
      idempotency: [],
    };
    this.snapshot = null;
    this.failNextAudit = false;
  }

  normalize(sql) {
    return sql.replace(/\s+/g, " ").trim().toLowerCase();
  }

  result(row) {
    return { rows: row ? [clone(row)] : [], rowCount: row ? 1 : 0 };
  }

  async query(sql, params = []) {
    const query = this.normalize(sql);
    if (query === "begin") {
      this.snapshot = clone(this.state);
      return { rows: [], rowCount: 0 };
    }
    if (query === "commit") {
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (query === "rollback") {
      if (this.snapshot) this.state = this.snapshot;
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (query.includes("pg_advisory_xact_lock")) return this.result({ locked: true });

    if (query.includes("from mutation_idempotency")) {
      return this.result(this.state.idempotency.find(
        (item) =>
          item.scope === params[0] &&
          item.operation === params[1] &&
          item.idempotency_key === params[2],
      ));
    }
    if (query.startsWith("insert into mutation_idempotency")) {
      const row = {
        id: params[0],
        scope: params[1],
        operation: params[2],
        idempotency_key: params[3],
        fingerprint: params[4],
        resource_type: params[5],
        resource_id: params[6],
        response_status: params[7],
        response_json: JSON.parse(params[8]),
      };
      this.state.idempotency.push(row);
      return this.result(row);
    }
    if (query.startsWith("insert into audit_logs")) {
      if (this.failNextAudit) {
        this.failNextAudit = false;
        throw new Error("simulated staff invitation audit failure");
      }
      const row = {
        id: params[0],
        actor_user_id: params[1],
        organization_id: params[2],
        action: params[3],
        resource_type: params[4],
        resource_id: params[5],
        metadata: JSON.parse(params[8]),
      };
      this.state.auditLogs.push(row);
      return this.result(row);
    }

    if (query.includes("from organizations where id = $1")) {
      return this.result(this.state.organizations.find((item) => item.id === params[0]));
    }
    if (query.startsWith("update staff_invitations set status = 'expired'")) {
      return { rows: [], rowCount: 0 };
    }
    if (query.includes("join users account")) {
      const account = this.state.users.find(
        (item) => item.email.toLowerCase() === String(params[1]).toLowerCase(),
      );
      const membership = account && this.state.memberships.find(
        (item) => item.organization_id === params[0] && item.user_id === account.id,
      );
      return this.result(membership ? { id: membership.id } : null);
    }
    if (
      query.includes("from staff_invitations") &&
      query.includes("organization_id = $1") &&
      query.includes("lower(email) = lower($2)") &&
      query.includes("status = 'pending'")
    ) {
      return this.result(this.state.staffInvitations.find(
        (item) =>
          item.organization_id === params[0] &&
          item.email.toLowerCase() === String(params[1]).toLowerCase() &&
          item.status === "pending",
      ));
    }
    if (query.startsWith("insert into staff_invitations")) {
      const row = {
        id: params[0],
        organization_id: params[1],
        email: params[2],
        role: params[3],
        name: params[4],
        phone: params[5],
        specialty: params[6],
        license: params[7],
        status: "pending",
        token_hash: params[8],
        expires_at: params[9],
        accepted_at: null,
        accepted_by_user_id: null,
        revoked_at: null,
        revoked_by_user_id: null,
        revoke_reason: "",
        created_by_user_id: params[10],
        last_sent_at: null,
        send_count: 0,
        email_delivery_status: params[11],
        email_provider: params[12],
        email_message_id: "",
        email_last_attempt_at: null,
        email_error_code: "",
        created_at: params[13],
        updated_at: params[14],
      };
      this.state.staffInvitations.push(row);
      return this.result(row);
    }
    if (query.includes("from staff_invitations where token_hash = $1")) {
      return this.result(this.state.staffInvitations.find((item) => item.token_hash === params[0]));
    }
    if (query.includes("from users where id = $1")) {
      return this.result(this.state.users.find((item) => item.id === params[0]));
    }
    if (
      query.includes("from memberships where organization_id = $1") &&
      query.includes("user_id = $2")
    ) {
      return this.result(this.state.memberships.find(
        (item) => item.organization_id === params[0] && item.user_id === params[1],
      ));
    }
    if (query.startsWith("update users set role = $2")) {
      const row = this.state.users.find((item) => item.id === params[0]);
      row.role = params[1];
      row.requested_role = params[1];
      row.role_request_status = "approved";
      row.account_status = "active";
      row.organization_id = params[2];
      row.name = params[3] || row.name;
      row.phone = params[4] || row.phone;
      row.department = params[5] || row.department;
      row.license = params[6] || row.license;
      row.hospital = params[7] || row.hospital;
      row.role_approved_at = params[8];
      row.updated_at = params[8];
      return this.result(row);
    }
    if (query.startsWith("insert into memberships")) {
      const row = {
        id: params[0],
        organization_id: params[1],
        user_id: params[2],
        role: params[3],
        status: "active",
        suspended_at: null,
        created_at: params[4],
        updated_at: params[4],
      };
      this.state.memberships.push(row);
      return this.result(row);
    }
    if (query.startsWith("update staff_invitations set status = 'accepted'")) {
      const row = this.state.staffInvitations.find((item) => item.id === params[0]);
      row.status = "accepted";
      row.accepted_at = params[1];
      row.accepted_by_user_id = params[2];
      row.updated_at = params[1];
      return this.result(row);
    }

    throw new Error(`Unhandled fake staff invitation SQL: ${query}`);
  }
}

function createPostgresInvitationRepository(sql) {
  const db = createRuntimeDb();
  return {
    db,
    repository: createStaffInvitationRepository({
      getDb: () => db,
      saveDb: async () => {},
      createId: createIdFactory(),
      nowIso: () => "2026-07-19T00:00:00.000Z",
      getPool: () => sql,
    }),
  };
}

test("PostgreSQL invitation creation and acceptance commit audit and idempotency atomically", async () => {
  const sql = new FakeStaffInvitationSql();
  const { repository } = createPostgresInvitationRepository(sql);
  const { token, input } = invitationIntent({ deliveryEmail: "ready" });
  input.deliveryProvider = "smtp";
  const created = await repository.create(input);
  const replay = await repository.create(input);
  assert.equal(created.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(Object.hasOwn(created.responseBody.invitation, "tokenHash"), false);
  assert.equal(sql.state.staffInvitations.length, 1);
  assert.equal(sql.state.staffInvitations[0].email_provider, "smtp");

  const accepted = await repository.accept({
    tokenHash: hashStaffInvitationToken(token),
    actorUserId: "user_invited",
    actorEmail: "invitee@alpha.test",
    idempotency: idempotency("staff.invitation.accept", "accept-sql", "accept-sql-v1"),
    audit: audit("staff.invitation.accept", "user_invited"),
  });
  assert.equal(accepted.responseBody.invitation.status, "accepted");
  assert.equal(accepted.responseBody.membership.role, "doctor");
  assert.equal(sql.state.users.find((item) => item.id === "user_invited").role, "doctor");
  assert.equal(sql.state.auditLogs.length, 2);
  assert.equal(sql.state.idempotency.length, 2);
});

test("PostgreSQL invitation creation rolls back the invitation when audit persistence fails", async () => {
  const sql = new FakeStaffInvitationSql();
  const { repository } = createPostgresInvitationRepository(sql);
  sql.failNextAudit = true;
  await assert.rejects(
    repository.create(invitationIntent().input),
    /simulated staff invitation audit failure/,
  );
  assert.equal(sql.state.staffInvitations.length, 0);
  assert.equal(sql.state.auditLogs.length, 0);
  assert.equal(sql.state.idempotency.length, 0);
});

test("migration, importer, routes and OpenAPI keep invitation secrets and tenant scope explicit", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "039_staff_invitations.sql"),
    "utf8",
  );
  const importer = fs.readFileSync(path.join(__dirname, "migrateJsonToPostgres.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const repository = fs.readFileSync(
    path.join(__dirname, "..", "src", "staffInvitationRepository.js"),
    "utf8",
  );
  const openapi = fs.readFileSync(path.join(__dirname, "..", "public", "openapi.yaml"), "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_invitations/);
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.match(migration, /organization_id text NOT NULL REFERENCES organizations\(id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /\btoken\s+text\b/i);
  assert.match(importer, /INSERT INTO staff_invitations/);
  assert.match(importer, /token_hash/);
  assert.doesNotMatch(importer, /invitation\.token\b/);
  assert.match(repository, /STAFF_INVITATION_EMAIL_MISMATCH/);
  assert.match(server, /staff-invitations/);
  assert.match(server, /"https:\/\/shcare\.web\.app"/);
  assert.match(server, /\/staff-invitations\/accept\?token=/);
  assert.doesNotMatch(server, /portal\/invitations\/accept\?token=/);
  assert.ok(openapi.includes("/admin/staff-invitations:"));
  assert.ok(openapi.includes("/admin/staff-invitations/{invitationId}/resend:"));
  assert.ok(openapi.includes("/staff-invitations/accept:"));
});

test("token hashing is deterministic and collision-resistant for independently generated fixtures", () => {
  const tokens = Array.from({ length: 32 }, () => generateStaffInvitationToken());
  assert.equal(new Set(tokens).size, tokens.length);
  assert.equal(new Set(tokens.map(hashStaffInvitationToken)).size, tokens.length);
  assert.equal(
    hashStaffInvitationToken("fixture-token"),
    crypto.createHash("sha256").update("fixture-token", "utf8").digest("hex"),
  );
});
