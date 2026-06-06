const crypto = require("node:crypto");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function assertColumn(client, tableName, columnName) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    `,
    [tableName, columnName]
  );
  if (result.rowCount === 0) {
    throw new Error(`Missing required column ${tableName}.${columnName}`);
  }
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const suffix = crypto.randomBytes(4).toString("hex");
  const orgId = `smoke_org_${suffix}`;
  const userId = `smoke_user_${suffix}`;
  const patientId = `smoke_patient_${suffix}`;
  const deviceId = `smoke_device_${suffix}`;
  const notificationId = `smoke_noti_${suffix}`;
  const auditId = `smoke_audit_${suffix}`;

  try {
    await assertColumn(client, "users", "account_status");
    await assertColumn(client, "users", "role_request_status");
    await assertColumn(client, "notifications", "organization_id");
    await assertColumn(client, "patients", "organization_id");
    await assertColumn(client, "devices", "organization_id");

    await client.query("BEGIN");
    await client.query(
      "INSERT INTO organizations (id, name, type) VALUES ($1, $2, 'clinic')",
      [orgId, "Smoke Clinic"]
    );
    await client.query(
      `
        INSERT INTO users (
          id, email, role, name, organization_id, account_status, requested_role, role_request_status
        )
        VALUES ($1, $2, 'patient', 'Smoke User', $3, 'active', 'doctor', 'pending')
      `,
      [userId, `${userId}@example.test`, orgId]
    );
    await client.query(
      `
        INSERT INTO notifications (id, user_id, organization_id, type, title, message)
        VALUES ($1, $2, $3, 'info', 'Smoke notification', 'Repository smoke test')
      `,
      [notificationId, userId, orgId]
    );
    await client.query(
      `
        INSERT INTO patients (id, organization_id, owner_user_id, patient_code, name)
        VALUES ($1, $2, $3, $4, 'Smoke Patient')
      `,
      [patientId, orgId, userId, `SMOKE-${suffix}`]
    );
    await client.query(
      `
        INSERT INTO devices (id, organization_id, paired_user_id, name, status, connected)
        VALUES ($1, $2, $3, 'Smoke Device', 'available', false)
      `,
      [deviceId, orgId, userId]
    );
    await client.query(
      `
        INSERT INTO audit_logs (id, actor_user_id, organization_id, action, resource_type, resource_id)
        VALUES ($1, $2, $3, 'smoke.audit', 'user', $2)
      `,
      [auditId, userId, orgId]
    );

    const notification = await client.query("SELECT read_at FROM notifications WHERE id = $1", [notificationId]);
    if (notification.rowCount !== 1) {
      throw new Error("Notification insert smoke test failed");
    }
    const patient = await client.query("SELECT id FROM patients WHERE id = $1", [patientId]);
    if (patient.rowCount !== 1) {
      throw new Error("Patient insert smoke test failed");
    }
    const device = await client.query("SELECT id FROM devices WHERE id = $1", [deviceId]);
    if (device.rowCount !== 1) {
      throw new Error("Device insert smoke test failed");
    }

    let auditIsAppendOnly = false;
    try {
      await client.query("UPDATE audit_logs SET action = 'smoke.modified' WHERE id = $1", [auditId]);
    } catch {
      auditIsAppendOnly = true;
    }
    if (!auditIsAppendOnly) {
      throw new Error("audit_logs append-only trigger is not active");
    }

    await client.query("ROLLBACK");
    console.log("postgres smoke test passed");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
