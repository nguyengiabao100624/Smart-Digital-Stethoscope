-- Smart Health clients authenticate with Firebase and access data through the
-- Render backend. No browser/mobile client is allowed to query Supabase Data
-- API tables directly, so exposed public tables use deny-by-default RLS.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations',
    'users',
    'memberships',
    'patients',
    'doctor_patient_access',
    'devices',
    'device_claims',
    'scan_sessions',
    'audio_files',
    'ai_results',
    'notifications',
    'notification_devices',
    'auth_sessions',
    'idempotency_keys',
    'device_events',
    'access_logs',
    'audit_logs',
    'exports',
    'chat_messages',
    'app_settings',
    'app_runtime_state',
    'schema_migrations'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

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
