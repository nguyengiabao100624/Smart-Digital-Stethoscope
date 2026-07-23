-- Re-assert doctor access identity rules for databases that may already have
-- run the earlier compatibility migration. Direct grants must use one
-- canonical users.id on both columns; workspace-only grants keep both NULL.

-- Keep the preflight, canonicalization, constraints, triggers and postflight
-- within one migration-wide write barrier. The migration runner wraps this
-- file in a transaction, so no direct grant or doctor role change can slip
-- between the postflight and trigger installation.
LOCK TABLE users IN SHARE MODE;
LOCK TABLE doctor_patient_access IN SHARE ROW EXCLUSIVE MODE;

UPDATE doctor_patient_access
SET doctor_user_id = NULLIF(doctor_user_id, ''),
    doctor_id = NULLIF(doctor_id, '')
WHERE doctor_user_id = '' OR doctor_id = '';

DO $$
DECLARE
  invalid_count bigint;
  invalid_ids text;
BEGIN
  WITH candidate_counts AS (
    SELECT access.id,
           COUNT(DISTINCT doctor.id) AS candidate_count
    FROM doctor_patient_access access
    LEFT JOIN users doctor
      ON (access.doctor_user_id IS NULL OR access.doctor_user_id IN (doctor.id, doctor.firebase_uid))
     AND (access.doctor_id IS NULL OR access.doctor_id IN (doctor.id, doctor.firebase_uid))
    WHERE access.doctor_user_id IS NOT NULL OR access.doctor_id IS NOT NULL
    GROUP BY access.id
  ), invalid AS (
    SELECT id
    FROM candidate_counts
    WHERE candidate_count <> 1
  )
  SELECT COUNT(*), string_agg(id, ', ' ORDER BY id)
  INTO invalid_count, invalid_ids
  FROM invalid;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'patient access authority migration blocked: % conflicting or unresolved row(s): %',
      invalid_count,
      left(COALESCE(invalid_ids, ''), 1000);
  END IF;
END;
$$;

WITH canonical_doctor_access AS (
  SELECT access.id AS access_id, MIN(doctor.id) AS doctor_user_id
  FROM doctor_patient_access access
  JOIN users doctor
    ON (access.doctor_user_id IS NULL OR access.doctor_user_id IN (doctor.id, doctor.firebase_uid))
   AND (access.doctor_id IS NULL OR access.doctor_id IN (doctor.id, doctor.firebase_uid))
  WHERE access.doctor_user_id IS NOT NULL OR access.doctor_id IS NOT NULL
  GROUP BY access.id
  HAVING COUNT(DISTINCT doctor.id) = 1
)
UPDATE doctor_patient_access access
SET doctor_user_id = canonical_doctor_access.doctor_user_id,
    doctor_id = canonical_doctor_access.doctor_user_id,
    updated_at = now()
FROM canonical_doctor_access
WHERE access.id = canonical_doctor_access.access_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'doctor_patient_access'::regclass
      AND conname = 'doctor_patient_access_canonical_doctor_check'
  ) THEN
    ALTER TABLE doctor_patient_access
      ADD CONSTRAINT doctor_patient_access_canonical_doctor_check
      CHECK (
        (doctor_user_id IS NULL AND doctor_id IS NULL)
        OR (
          doctor_user_id IS NOT NULL
          AND doctor_id IS NOT NULL
          AND doctor_user_id = doctor_id
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'doctor_patient_access'::regclass
      AND conname = 'doctor_patient_access_principal_required_check'
  ) THEN
    ALTER TABLE doctor_patient_access
      ADD CONSTRAINT doctor_patient_access_principal_required_check
      CHECK (
        revoked_at IS NOT NULL
        OR organization_id IS NOT NULL
        OR doctor_user_id IS NOT NULL
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'doctor_patient_access'::regclass
      AND conname = 'doctor_patient_access_scope_check'
  ) THEN
    ALTER TABLE doctor_patient_access
      ADD CONSTRAINT doctor_patient_access_scope_check
      CHECK (
        scope = 'patient_profile'
        OR (
          scope = 'selected_scans'
          AND jsonb_typeof(scan_ids) = 'array'
          AND jsonb_array_length(scan_ids) > 0
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE doctor_patient_access
  VALIDATE CONSTRAINT doctor_patient_access_canonical_doctor_check,
  VALIDATE CONSTRAINT doctor_patient_access_principal_required_check,
  VALIDATE CONSTRAINT doctor_patient_access_scope_check;

CREATE OR REPLACE FUNCTION enforce_active_doctor_access_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_doctor_role text;
BEGIN
  IF NEW.doctor_user_id IS NOT NULL
     AND NEW.revoked_at IS NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > now()) THEN
    -- FOR SHARE conflicts with the row lock taken by UPDATE users SET role.
    -- Whichever transaction starts first therefore determines a safe order:
    -- either the grant commits and the demotion revokes it, or the demotion
    -- commits and this mutation sees the non-doctor role and is rejected.
    SELECT doctor.role
    INTO canonical_doctor_role
    FROM users doctor
    WHERE doctor.id = NEW.doctor_user_id
    FOR SHARE;

    IF canonical_doctor_role IS DISTINCT FROM 'doctor' THEN
      RAISE EXCEPTION
        'active direct patient access requires a canonical doctor user: %',
        NEW.doctor_user_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS doctor_patient_access_validate_identity ON doctor_patient_access;
CREATE TRIGGER doctor_patient_access_validate_identity
BEFORE INSERT OR UPDATE OF doctor_user_id, doctor_id, expires_at, revoked_at
ON doctor_patient_access
FOR EACH ROW
EXECUTE FUNCTION enforce_active_doctor_access_identity();

CREATE OR REPLACE FUNCTION revoke_patient_access_on_doctor_demotion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'doctor'
     AND NEW.role IS DISTINCT FROM 'doctor' THEN
    WITH revoked AS (
      UPDATE doctor_patient_access access
      SET revoked_at = now(),
          revoked_by_user_id = NULL,
          updated_at = now()
      WHERE access.doctor_user_id = OLD.id
        AND access.doctor_id = OLD.id
        AND access.revoked_at IS NULL
        AND (access.expires_at IS NULL OR access.expires_at > now())
      RETURNING access.id, access.organization_id, access.patient_id
    )
    INSERT INTO audit_logs (
      id, actor_user_id, organization_id, action, resource_type,
      resource_id, metadata, created_at
    )
    SELECT
      'audit_access_role_' || md5(revoked.id || ':' || txid_current()::text),
      NULL,
      revoked.organization_id,
      'patient.share.auto_revoke',
      'patient_share',
      revoked.id,
      jsonb_build_object(
        'patientId', revoked.patient_id,
        'doctorUserId', OLD.id,
        'reason', 'doctor_role_removed'
      ),
      now()
    FROM revoked
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_active_patient_access ON users;
CREATE TRIGGER users_guard_active_patient_access
BEFORE UPDATE OF role
ON users
FOR EACH ROW
EXECUTE FUNCTION revoke_patient_access_on_doctor_demotion();

DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM doctor_patient_access access
  WHERE (access.doctor_user_id IS NOT NULL OR access.doctor_id IS NOT NULL)
    AND (
      access.doctor_user_id IS DISTINCT FROM access.doctor_id
      OR NOT EXISTS (
        SELECT 1
        FROM users doctor
        WHERE doctor.id = access.doctor_user_id
          AND doctor.id = access.doctor_id
          AND (
            access.revoked_at IS NOT NULL
            OR (access.expires_at IS NOT NULL AND access.expires_at <= now())
            OR doctor.role = 'doctor'
          )
      )
    );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'patient access authority postflight failed: invalid_rows=%', invalid_count;
  END IF;
END;
$$;
