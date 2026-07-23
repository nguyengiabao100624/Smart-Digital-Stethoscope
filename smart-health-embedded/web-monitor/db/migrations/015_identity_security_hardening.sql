-- Additive identity-provider saga ledger plus deny-by-default protection for
-- tables introduced after the original public-schema RLS migration.

CREATE TABLE IF NOT EXISTS identity_operations (
  id text PRIMARY KEY,
  target_user_id text NOT NULL,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('lock', 'unlock', 'delete', 'reset_password', 'change_role')),
  status text NOT NULL CHECK (status IN ('pending_provider', 'provider_applied', 'completed', 'provider_failed')),
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  previous_account_status text,
  target_account_status text,
  target_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_status text,
  provider_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (target_user_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS identity_operations_target_status_idx
  ON identity_operations (target_user_id, status, updated_at DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'appointments',
    'mutation_idempotency',
    'two_factor_enrollments',
    'two_factor_credentials',
    'two_factor_challenges',
    'two_factor_tokens',
    'identity_operations'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      -- Do not FORCE RLS until deployment provisions and verifies a dedicated
      -- BYPASSRLS backend role; the current DATABASE_URL may use the table owner.
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
      END IF;
    END IF;
  END LOOP;
END
$$;
