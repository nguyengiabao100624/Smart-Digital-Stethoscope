CREATE TABLE IF NOT EXISTS service_packages (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'basic',
  segment text NOT NULL DEFAULT 'organization',
  price double precision NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'VND',
  duration text NOT NULL DEFAULT 'monthly',
  max_devices double precision NOT NULL DEFAULT 0,
  max_doctors double precision NOT NULL DEFAULT 0,
  max_patients double precision NOT NULL DEFAULT 0,
  storage_gb double precision NOT NULL DEFAULT 0,
  ai_monthly double precision NOT NULL DEFAULT 0,
  retention_days double precision NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_packages_id_check
    CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  CONSTRAINT service_packages_name_check
    CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT service_packages_type_check
    CHECK (type IN ('trial', 'basic', 'professional', 'enterprise', 'custom', 'solo', 'personal')),
  CONSTRAINT service_packages_segment_check
    CHECK (segment IN ('organization', 'solo_practice', 'personal')),
  CONSTRAINT service_packages_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT service_packages_duration_check
    CHECK (duration IN ('monthly', 'quarterly', 'yearly')),
  CONSTRAINT service_packages_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT service_packages_price_check
    CHECK (price >= 0 AND price < 'Infinity'::double precision),
  CONSTRAINT service_packages_max_devices_check
    CHECK (max_devices >= 0 AND max_devices < 'Infinity'::double precision),
  CONSTRAINT service_packages_max_doctors_check
    CHECK (max_doctors >= 0 AND max_doctors < 'Infinity'::double precision),
  CONSTRAINT service_packages_max_patients_check
    CHECK (max_patients >= 0 AND max_patients < 'Infinity'::double precision),
  CONSTRAINT service_packages_storage_gb_check
    CHECK (storage_gb >= 0 AND storage_gb < 'Infinity'::double precision),
  CONSTRAINT service_packages_ai_monthly_check
    CHECK (ai_monthly >= 0 AND ai_monthly < 'Infinity'::double precision),
  CONSTRAINT service_packages_retention_days_check
    CHECK (retention_days >= 0 AND retention_days < 'Infinity'::double precision)
);

CREATE UNIQUE INDEX IF NOT EXISTS service_packages_name_ci_unique
  ON service_packages (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS service_packages_status_segment_idx
  ON service_packages (status, segment, updated_at DESC);

INSERT INTO service_packages (
  id, name, type, segment, price, currency, duration,
  max_devices, max_doctors, max_patients, storage_gb, ai_monthly,
  retention_days, features, status
)
VALUES
  (
    'pkg_clinic_basic', 'Clinic Basic', 'basic', 'organization', 2500000, 'VND', 'monthly',
    3, 5, 1000, 200, 2000, 365,
    '{"cloudStorage":true,"analytics":true,"aiDiagnosis":true}'::jsonb, 'active'
  ),
  (
    'pkg_solo_doctor', 'Solo Doctor', 'solo', 'solo_practice', 490000, 'VND', 'monthly',
    1, 1, 150, 50, 500, 180,
    '{"cloudStorage":true,"analytics":true,"aiDiagnosis":true}'::jsonb, 'active'
  ),
  (
    'pkg_personal_family', 'Personal Family', 'personal', 'personal', 99000, 'VND', 'monthly',
    2, 0, 6, 20, 100, 180,
    '{"cloudStorage":true,"analytics":false,"aiDiagnosis":true}'::jsonb, 'active'
  )
ON CONFLICT (id) DO NOTHING;

-- Preserve existing workspace references before adding the canonical FK. Any
-- non-standard legacy package is imported as an explicit placeholder and can
-- be edited or archived by Platform Admin after migration.
INSERT INTO service_packages (id, name, type, segment, status)
SELECT DISTINCT organization.package_id, organization.package_id, 'custom', 'organization', 'active'
FROM organizations organization
WHERE NULLIF(btrim(organization.package_id), '') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'organizations'::regclass
      AND conname = 'organizations_package_id_fkey'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_package_id_fkey
      FOREIGN KEY (package_id) REFERENCES service_packages(id) ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE organizations
  VALIDATE CONSTRAINT organizations_package_id_fkey;

DO $$
BEGIN
  ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE service_packages FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE service_packages FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE service_packages FROM authenticated;
  END IF;
END;
$$;
