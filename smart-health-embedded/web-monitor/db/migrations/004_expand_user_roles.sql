ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      'admin',
      'workspace_admin',
      'workspace_owner',
      'doctor',
      'patient',
      'nurse',
      'technician',
      'billing',
      'viewer'
    )
  );
