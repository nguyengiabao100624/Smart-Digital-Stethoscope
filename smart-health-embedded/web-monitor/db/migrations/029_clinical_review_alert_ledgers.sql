CREATE TABLE IF NOT EXISTS scan_reviews (
  id text PRIMARY KEY,
  scan_id text NOT NULL UNIQUE REFERENCES scan_sessions(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id),
  patient_id text NOT NULL REFERENCES patients(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  decision text CHECK (decision IS NULL OR decision IN ('accepted', 'repeat_measurement', 'follow_up_required')),
  note text,
  reviewer_user_id text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scan_reviews_workspace_status_idx
  ON scan_reviews (organization_id, status, updated_at DESC);

INSERT INTO scan_reviews (
  id, scan_id, organization_id, patient_id, status, version, created_at, updated_at
)
SELECT
  'review_' || scan.id,
  scan.id,
  scan.organization_id,
  scan.patient_id,
  'pending',
  1,
  COALESCE(scan.created_at, now()),
  COALESCE(scan.updated_at, scan.created_at, now())
FROM scan_sessions scan
WHERE scan.organization_id IS NOT NULL
  AND scan.status IN ('completed', 'needs_review')
ON CONFLICT (scan_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS clinical_alerts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL CHECK (source_type IN ('device', 'scan')),
  source_id text NOT NULL,
  dedupe_key text NOT NULL,
  occurrence_number integer NOT NULL DEFAULT 1 CHECK (occurrence_number > 0),
  previous_alert_id text REFERENCES clinical_alerts(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  message text NOT NULL,
  patient_id text REFERENCES patients(id) ON DELETE SET NULL,
  device_id text REFERENCES devices(id) ON DELETE SET NULL,
  scan_id text REFERENCES scan_sessions(id) ON DELETE SET NULL,
  acknowledged_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  acknowledgement_note text,
  resolved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clinical_alerts
  ADD COLUMN IF NOT EXISTS occurrence_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_alert_id text REFERENCES clinical_alerts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

UPDATE clinical_alerts
SET occurred_at = COALESCE(occurred_at, created_at, updated_at, now())
WHERE occurred_at IS NULL;

ALTER TABLE clinical_alerts
  ALTER COLUMN occurred_at SET DEFAULT now(),
  ALTER COLUMN occurred_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinical_alerts'::regclass
      AND conname = 'clinical_alerts_occurrence_number_check'
  ) THEN
    ALTER TABLE clinical_alerts
      ADD CONSTRAINT clinical_alerts_occurrence_number_check
      CHECK (occurrence_number > 0) NOT VALID;
    ALTER TABLE clinical_alerts VALIDATE CONSTRAINT clinical_alerts_occurrence_number_check;
  END IF;
END
$$;

ALTER TABLE clinical_alerts
  DROP CONSTRAINT IF EXISTS clinical_alerts_organization_id_dedupe_key_key;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.clinical_alerts'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (organization_id, dedupe_key)'
  LOOP
    EXECUTE format('ALTER TABLE public.clinical_alerts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS clinical_alerts_workspace_status_idx
  ON clinical_alerts (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS clinical_alerts_source_idx
  ON clinical_alerts (source_type, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS clinical_alerts_source_occurrence_uidx
  ON clinical_alerts (organization_id, dedupe_key, occurrence_number);

CREATE UNIQUE INDEX IF NOT EXISTS clinical_alerts_one_active_source_uidx
  ON clinical_alerts (organization_id, dedupe_key)
  WHERE status IN ('open', 'acknowledged');

ALTER TABLE scan_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scan_reviews FROM PUBLIC;
REVOKE ALL ON TABLE clinical_alerts FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE scan_reviews FROM anon;
    REVOKE ALL ON TABLE clinical_alerts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE scan_reviews FROM authenticated;
    REVOKE ALL ON TABLE clinical_alerts FROM authenticated;
  END IF;
END
$$;
