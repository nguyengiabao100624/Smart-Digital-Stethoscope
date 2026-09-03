CREATE TABLE IF NOT EXISTS ai_conversations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_scope_updated_idx
  ON ai_conversations (user_id, organization_id, updated_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS conversation_id text REFERENCES ai_conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS context_references jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
  ON chat_messages (conversation_id, created_at ASC)
  WHERE conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_chat_attachments (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id text REFERENCES chat_messages(id) ON DELETE SET NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  sha256 text NOT NULL,
  object_key text NOT NULL UNIQUE,
  storage_provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_attachments_scope_conversation_idx
  ON ai_chat_attachments (user_id, organization_id, conversation_id, created_at ASC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE ai_conversations FROM PUBLIC;
REVOKE ALL ON TABLE ai_chat_attachments FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE ai_conversations FROM anon;
    REVOKE ALL ON TABLE ai_chat_attachments FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE ai_conversations FROM authenticated;
    REVOKE ALL ON TABLE ai_chat_attachments FROM authenticated;
  END IF;
END
$$;
