CREATE TABLE IF NOT EXISTS two_factor_enrollments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method = 'app'),
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  secret_tag text NOT NULL,
  secret_version integer NOT NULL DEFAULT 1,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS two_factor_enrollments_one_pending_idx
  ON two_factor_enrollments (user_id)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS two_factor_credentials (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method = 'app'),
  enrollment_id text NOT NULL,
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  secret_tag text NOT NULL,
  secret_version integer NOT NULL DEFAULT 1,
  recovery_salt text NOT NULL,
  recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_used_time_step bigint,
  disable_attempts integer NOT NULL DEFAULT 0 CHECK (disable_attempts >= 0),
  disable_locked_until timestamptz,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

ALTER TABLE two_factor_credentials
  ADD COLUMN IF NOT EXISTS disable_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disable_locked_until timestamptz;

CREATE TABLE IF NOT EXISTS two_factor_challenges (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_auth_source text NOT NULL,
  primary_binding_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS two_factor_challenges_user_created_idx
  ON two_factor_challenges (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS two_factor_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  primary_binding_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS two_factor_tokens_user_expiry_idx
  ON two_factor_tokens (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- Remove legacy fake 2FA material from the profile JSON. The migration is
-- intentionally fail-closed: no credential row is created from preview data
-- or plaintext recovery codes that were never verified by a TOTP challenge.
UPDATE users
SET firebase_claims = jsonb_set(
  COALESCE(firebase_claims, '{}'::jsonb)
    - 'twoFactorSecret'
    - 'twoFactorSecretPreview'
    - 'twoFactorRecoveryCodes',
  '{profile}',
  (
    COALESCE(firebase_claims->'profile', '{}'::jsonb)
      - 'twoFactorSecret'
      - 'twoFactorSecretPreview'
      - 'twoFactorRecoveryCodes'
  ) || jsonb_build_object('twoFactorEnabled', false, 'twoFactorMethod', ''),
  true
)
WHERE COALESCE(firebase_claims, '{}'::jsonb) ?| ARRAY[
    'twoFactorSecret',
    'twoFactorSecretPreview',
    'twoFactorRecoveryCodes'
  ]
  OR COALESCE(firebase_claims->'profile', '{}'::jsonb) ?| ARRAY[
    'twoFactorEnabled',
    'twoFactorMethod',
    'twoFactorSecret',
    'twoFactorSecretPreview',
    'twoFactorRecoveryCodes'
  ];
