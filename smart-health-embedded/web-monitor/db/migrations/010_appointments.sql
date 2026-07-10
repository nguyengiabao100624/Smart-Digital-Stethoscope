CREATE TABLE IF NOT EXISTS appointments (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  patient_id text REFERENCES patients(id) ON DELETE CASCADE,
  doctor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'remote_consultation',
  status text NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text,
  channel text,
  reason text,
  notes text,
  cancellation_reason text,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_time_window_chk CHECK (ends_at > starts_at),
  CONSTRAINT appointments_type_chk CHECK (type IN ('remote_consultation', 'clinic_visit', 'measurement', 'follow_up')),
  CONSTRAINT appointments_status_chk CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'))
);

CREATE INDEX IF NOT EXISTS appointments_workspace_start_idx
  ON appointments (organization_id, starts_at);

CREATE INDEX IF NOT EXISTS appointments_patient_start_idx
  ON appointments (patient_id, starts_at);

CREATE INDEX IF NOT EXISTS appointments_doctor_start_idx
  ON appointments (doctor_user_id, starts_at);

CREATE INDEX IF NOT EXISTS appointments_status_idx
  ON appointments (status, starts_at);
