-- Doctor workspace reassignment is an audited identity-provider operation of
-- its own. It preserves workspace-owner memberships while moving the
-- account's primary operational workspace and Firebase claims.

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_definition.conname
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.identity_operations'::regclass
      AND constraint_definition.contype = 'c'
      AND constraint_definition.conkey = ARRAY[
        (
          SELECT operation_column.attnum
          FROM pg_attribute AS operation_column
          WHERE operation_column.attrelid = 'public.identity_operations'::regclass
            AND operation_column.attname = 'operation'
            AND NOT operation_column.attisdropped
        )
      ]::smallint[]
      AND pg_get_constraintdef(constraint_definition.oid) ~ '\moperation\M'
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
        'lock',
        'unlock',
        'delete',
        'reset_password',
        'change_role',
        'managed_admin_activate',
        'doctor_workspace_assign'
      )
    )
    NOT VALID;
END
$$;

ALTER TABLE public.identity_operations
  VALIDATE CONSTRAINT identity_operations_operation_check;
