-- Audit rows are append-only, so an account deletion cannot UPDATE the actor
-- column to satisfy a users foreign key. Retain the stable actor identifier as
-- forensic history while allowing the user/PII row itself to be removed.

DO $$
DECLARE
  actor_foreign_key record;
BEGIN
  FOR actor_foreign_key IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
    JOIN pg_attribute actor_column
      ON actor_column.attrelid = source_table.oid
     AND actor_column.attname = 'actor_user_id'
    WHERE source_schema.nspname = 'public'
      AND source_table.relname = 'audit_logs'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.users'::regclass
      AND actor_column.attnum = ANY(constraint_row.conkey)
  LOOP
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', actor_foreign_key.conname);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION validate_audit_actor_on_insert()
RETURNS trigger AS $$
BEGIN
  IF NEW.actor_user_id IS NOT NULL THEN
    PERFORM 1 FROM users WHERE id = NEW.actor_user_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'audit_logs.actor_user_id references a missing user: %', NEW.actor_user_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_actor_insert_guard ON audit_logs;
CREATE TRIGGER audit_logs_actor_insert_guard
BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION validate_audit_actor_on_insert();

COMMENT ON COLUMN audit_logs.actor_user_id IS
  'Immutable historical user identifier; intentionally retained after the users row is deleted.';
