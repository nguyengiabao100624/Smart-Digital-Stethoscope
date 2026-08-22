CREATE TABLE IF NOT EXISTS role_request_documents (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  object_key text NOT NULL UNIQUE,
  storage_provider text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_request_documents_content_type_check
    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT role_request_documents_byte_size_check
    CHECK (byte_size BETWEEN 1 AND 10485760),
  CONSTRAINT role_request_documents_name_check
    CHECK (char_length(name) BETWEEN 1 AND 240)
);

CREATE INDEX IF NOT EXISTS role_request_documents_user_uploaded_idx
  ON role_request_documents (user_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS role_request_documents_workspace_uploaded_idx
  ON role_request_documents (organization_id, uploaded_at DESC);

DO $$
BEGIN
  ALTER TABLE role_request_documents ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE role_request_documents FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE role_request_documents FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE role_request_documents FROM authenticated;
  END IF;
END;
$$;
