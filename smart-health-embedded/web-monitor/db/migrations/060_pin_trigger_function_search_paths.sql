-- Pin trigger-function name resolution so callers cannot influence which
-- relations are used through a session-level search_path. These functions
-- remain SECURITY INVOKER and preserve their existing trigger contracts.
--
-- Supabase can own pre-existing functions with its bootstrap `postgres` role
-- while an application migration connects through a pooler role. PostgreSQL
-- correctly refuses CREATE OR REPLACE in that case. The owner branch below
-- applies the hardening on a fresh/application-owned database; the non-owner
-- branch only accepts the migration when the privileged Supabase migration has
-- already pinned every function. It never silently accepts an unsafe state.

DO $migration$
DECLARE
  expected_function_count integer;
  current_role_owns_all boolean;
  all_functions_are_hardened boolean;
BEGIN
  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.bool_and(
      procedure.proowner = role.oid
      OR role.rolsuper
    ),
    pg_catalog.bool_and(
      'search_path=""' = ANY(
        COALESCE(procedure.proconfig, ARRAY[]::text[])
      )
    )
  INTO
    expected_function_count,
    current_role_owns_all,
    all_functions_are_hardened
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN pg_catalog.pg_roles AS role
    ON role.rolname = CURRENT_USER
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'prevent_audit_log_mutation',
      'validate_audit_actor_on_insert',
      'enforce_active_doctor_access_identity',
      'revoke_patient_access_on_doctor_demotion'
    )
    AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) = '';

  IF expected_function_count <> 4 THEN
    RAISE EXCEPTION
      'expected four Shcare trigger functions, found %',
      expected_function_count;
  END IF;

  IF NOT current_role_owns_all THEN
    IF all_functions_are_hardened THEN
      RAISE NOTICE
        'trigger functions are already hardened by their owning role; skipping replacement as %',
        CURRENT_USER;
      RETURN;
    END IF;

    RAISE EXCEPTION
      'trigger function hardening requires the owning database role; run migration 060 through Supabase, then retry the application migration';
  END IF;

  EXECUTE $prevent_audit_log_mutation$
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;
  $prevent_audit_log_mutation$;

  EXECUTE $validate_audit_actor_on_insert$
CREATE OR REPLACE FUNCTION public.validate_audit_actor_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.actor_user_id IS NOT NULL THEN
    PERFORM 1
    FROM public.users AS candidate_user
    WHERE candidate_user.id = NEW.actor_user_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'audit_logs.actor_user_id references a missing user: %', NEW.actor_user_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
  $validate_audit_actor_on_insert$;

  EXECUTE $enforce_active_doctor_access_identity$
CREATE OR REPLACE FUNCTION public.enforce_active_doctor_access_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  canonical_doctor_role text;
BEGIN
  IF NEW.doctor_user_id IS NOT NULL
     AND NEW.revoked_at IS NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > pg_catalog.now()) THEN
    -- FOR SHARE conflicts with the row lock taken by UPDATE users SET role.
    -- Whichever transaction starts first therefore determines a safe order:
    -- either the grant commits and the demotion revokes it, or the demotion
    -- commits and this mutation sees the non-doctor role and is rejected.
    SELECT doctor.role
    INTO canonical_doctor_role
    FROM public.users AS doctor
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
  $enforce_active_doctor_access_identity$;

  EXECUTE $revoke_patient_access_on_doctor_demotion$
CREATE OR REPLACE FUNCTION public.revoke_patient_access_on_doctor_demotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'doctor'
     AND NEW.role IS DISTINCT FROM 'doctor' THEN
    WITH revoked AS (
      UPDATE public.doctor_patient_access AS access
      SET revoked_at = pg_catalog.now(),
          revoked_by_user_id = NULL,
          updated_at = pg_catalog.now()
      WHERE access.doctor_user_id = OLD.id
        AND access.doctor_id = OLD.id
        AND access.revoked_at IS NULL
        AND (access.expires_at IS NULL OR access.expires_at > pg_catalog.now())
      RETURNING access.id, access.organization_id, access.patient_id
    )
    INSERT INTO public.audit_logs (
      id, actor_user_id, organization_id, action, resource_type,
      resource_id, metadata, created_at
    )
    SELECT
      'audit_access_role_' || pg_catalog.md5(revoked.id || ':' || pg_catalog.txid_current()::text),
      NULL,
      revoked.organization_id,
      'patient.share.auto_revoke',
      'patient_share',
      revoked.id,
      pg_catalog.jsonb_build_object(
        'patientId', revoked.patient_id,
        'doctorUserId', OLD.id,
        'reason', 'doctor_role_removed'
      ),
      pg_catalog.now()
    FROM revoked
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
  $revoke_patient_access_on_doctor_demotion$;

END;
$migration$;
