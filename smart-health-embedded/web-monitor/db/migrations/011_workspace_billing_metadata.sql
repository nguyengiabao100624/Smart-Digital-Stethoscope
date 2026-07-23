ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS workspace_type text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS representative text,
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE organizations
SET
  workspace_type = COALESCE(workspace_type, type),
  status = COALESCE(NULLIF(status, ''), 'active'),
  subscription_status = COALESCE(NULLIF(subscription_status, ''), 'trial'),
  billing_cycle = COALESCE(NULLIF(billing_cycle, ''), 'monthly'),
  request_metadata = COALESCE(request_metadata, '{}'::jsonb);

CREATE INDEX IF NOT EXISTS organizations_package_idx
  ON organizations (package_id);

CREATE INDEX IF NOT EXISTS organizations_subscription_status_idx
  ON organizations (subscription_status);
