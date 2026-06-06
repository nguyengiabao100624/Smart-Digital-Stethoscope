ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS requested_role text,
  ADD COLUMN IF NOT EXISTS role_request_status text,
  ADD COLUMN IF NOT EXISTS role_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS role_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS role_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS role_reject_reason text,
  ADD COLUMN IF NOT EXISTS role_info_request_at timestamptz,
  ADD COLUMN IF NOT EXISTS role_info_request_message text,
  ADD COLUMN IF NOT EXISTS firebase_claims jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_users_doctor_request
  ON users(requested_role, role_request_status, role_requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users(organization_id, role);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_org_created
  ON notifications(organization_id, created_at DESC);
