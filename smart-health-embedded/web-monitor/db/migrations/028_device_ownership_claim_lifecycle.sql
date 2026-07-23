-- Canonical, additive device ownership and claim lifecycle. Presence remains a
-- separate transport-derived concern; these columns must never be used to
-- infer that a device is online.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS ownership_state text NOT NULL DEFAULT 'provisioned',
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_patient_id text REFERENCES patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id text REFERENCES users(id) ON DELETE SET NULL;

UPDATE devices
SET owner_user_id = paired_user_id
WHERE owner_user_id IS NULL
  AND paired_user_id IS NOT NULL;

UPDATE devices
SET ownership_state = CASE
  WHEN revoked_at IS NOT NULL OR status = 'revoked' THEN 'revoked'
  WHEN assigned_patient_id IS NOT NULL THEN 'assigned'
  WHEN owner_user_id IS NOT NULL THEN 'claimed'
  ELSE 'provisioned'
END
WHERE ownership_state = 'provisioned';

-- Keep the API v1 alias equal to the canonical owner. Future writes are
-- constrained below so stale telemetry cannot erase or replace ownership.
UPDATE devices
SET paired_user_id = owner_user_id
WHERE paired_user_id IS DISTINCT FROM owner_user_id;

UPDATE devices
SET revoked_at = COALESCE(revoked_at, updated_at, now()),
    connected = false,
    status = 'revoked',
    ownership_state = 'revoked'
WHERE ownership_state = 'revoked' OR status = 'revoked';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'devices_ownership_state_check'
      AND conrelid = 'devices'::regclass
  ) THEN
    ALTER TABLE devices
      ADD CONSTRAINT devices_ownership_state_check
      CHECK (ownership_state IN ('provisioned', 'claimed', 'assigned', 'unassigned', 'revoked'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'devices_owner_alias_check'
      AND conrelid = 'devices'::regclass
  ) THEN
    ALTER TABLE devices
      ADD CONSTRAINT devices_owner_alias_check
      CHECK (paired_user_id IS NOT DISTINCT FROM owner_user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'devices_ownership_shape_check'
      AND conrelid = 'devices'::regclass
  ) THEN
    ALTER TABLE devices
      ADD CONSTRAINT devices_ownership_shape_check
      CHECK (
        (
          ownership_state = 'provisioned'
          AND owner_user_id IS NULL
          AND assigned_patient_id IS NULL
          AND revoked_at IS NULL
        )
        OR (
          ownership_state IN ('claimed', 'unassigned')
          AND owner_user_id IS NOT NULL
          AND assigned_patient_id IS NULL
          AND revoked_at IS NULL
        )
        OR (
          ownership_state = 'assigned'
          AND owner_user_id IS NOT NULL
          AND assigned_patient_id IS NOT NULL
          AND revoked_at IS NULL
        )
        OR (
          ownership_state = 'revoked'
          AND revoked_at IS NOT NULL
          AND connected = false
        )
      );
  END IF;
END
$$;

ALTER TABLE device_claims
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Repair only claims whose device already has an authoritative workspace.
-- Truly tenantless inventory remains fail-closed for an explicit remediation
-- workflow instead of being adopted by the first caller.
UPDATE device_claims AS claims
SET organization_id = devices.organization_id,
    updated_at = now()
FROM devices
WHERE claims.device_id = devices.id
  AND claims.organization_id IS NULL
  AND devices.organization_id IS NOT NULL;

-- Expired unused claims must be closed before deduplication; otherwise a newer
-- expired row could displace an older claim that is still usable.
UPDATE device_claims
SET revoked_at = now(),
    updated_at = now()
WHERE claimed_at IS NULL
  AND revoked_at IS NULL
  AND expires_at <= now();

-- Older JSON imports could contain more than one still-usable claim for a
-- device. Preserve the newest usable claim and close older rows before
-- enforcing one open claim at a time.
WITH ranked_active_claims AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY device_id
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM device_claims
  WHERE claimed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
)
UPDATE device_claims AS claims
SET revoked_at = now(),
    updated_at = now()
FROM ranked_active_claims AS ranked
WHERE claims.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS device_claims_one_active_per_device_idx
  ON device_claims (device_id)
  WHERE claimed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS device_claims_lookup_idx
  ON device_claims (device_id, claim_code_hash);

CREATE INDEX IF NOT EXISTS devices_workspace_ownership_idx
  ON devices (organization_id, ownership_state, updated_at DESC);
