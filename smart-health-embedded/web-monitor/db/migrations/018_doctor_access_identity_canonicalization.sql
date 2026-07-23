-- Compatibility rows may contain a Firebase UID in either doctor identity
-- column. Canonicalize only when both supplied aliases resolve to exactly one
-- doctor. A conflicting or unresolved direct grant must stop the migration;
-- silently picking one side would preserve an authorization bypass.

-- Serialize identity and grant writes while the compatibility backfill and
-- postflight run. Application mutations lock a user before its grants, so use
-- the same lock order here to avoid creating the inverse lock dependency.
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
      'doctor access identity canonicalization blocked: % conflicting or unresolved row(s): %',
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
    RAISE EXCEPTION
      'doctor access identity canonicalization postflight failed: invalid_rows=%',
      invalid_count;
  END IF;
END;
$$;
