-- Keep a newly-created managed admin non-authenticatable until Firebase has
-- been enabled and verified. The unresolved identity operation also shares
-- the per-user serialization invariant with lock/unlock/delete/role changes.

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_definition.conname
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.identity_operations'::regclass
      AND constraint_definition.contype = 'c'
      AND pg_get_constraintdef(constraint_definition.oid) ~ '\moperation\M'
      AND pg_get_constraintdef(constraint_definition.oid) LIKE '%lock%'
      AND pg_get_constraintdef(constraint_definition.oid) LIKE '%reset_password%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.identity_operations DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;

  ALTER TABLE public.identity_operations
    ADD CONSTRAINT identity_operations_operation_check
    CHECK (
      operation IN (
        'lock', 'unlock', 'delete', 'reset_password', 'change_role',
        'managed_admin_activate'
      )
    )
    NOT VALID;
END
$$;

ALTER TABLE public.identity_operations
  VALIDATE CONSTRAINT identity_operations_operation_check;
