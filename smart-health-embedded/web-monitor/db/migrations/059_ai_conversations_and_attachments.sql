DO $$
DECLARE
  relation_owner name;
BEGIN
  SELECT tableowner
  INTO relation_owner
  FROM pg_tables
  WHERE schemaname = current_schema()
    AND tablename = 'ai_conversations';

  IF relation_owner IS NULL THEN
    CREATE TABLE ai_conversations (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
      title text NOT NULL,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ai_conversations_scope_updated_idx
      ON ai_conversations (user_id, organization_id, updated_at DESC)
      WHERE archived_at IS NULL;
  ELSIF relation_owner = current_user THEN
    CREATE INDEX IF NOT EXISTS ai_conversations_scope_updated_idx
      ON ai_conversations (user_id, organization_id, updated_at DESC)
      WHERE archived_at IS NULL;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ai_conversations'
      AND column_name = 'organization_id'
      AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'ai_conversations'
      AND indexname = 'ai_conversations_scope_updated_idx'
  ) THEN
    RAISE EXCEPTION
      'Migration 059 requires the ai_conversations owner to install the complete AI schema before application startup';
  END IF;
END
$$;

-- Supabase can own existing tables with a different role than the Session
-- Pooler user used by Render. In that topology the owner applies the schema
-- change once, while later application deploys must only verify it instead of
-- failing startup with "must be owner of table chat_messages".
DO $$
DECLARE
  chat_messages_owner name;
BEGIN
  SELECT tableowner
  INTO chat_messages_owner
  FROM pg_tables
  WHERE schemaname = current_schema()
    AND tablename = 'chat_messages';

  IF chat_messages_owner = current_user THEN
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS conversation_id text REFERENCES ai_conversations(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS context_references jsonb NOT NULL DEFAULT '[]'::jsonb;

    CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
      ON chat_messages (conversation_id, created_at ASC)
      WHERE conversation_id IS NOT NULL;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'chat_messages'
      AND column_name = 'conversation_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'chat_messages'
      AND column_name = 'context_references'
  ) THEN
    RAISE EXCEPTION
      'Migration 059 requires the chat_messages owner to add AI conversation columns before application startup';
  END IF;
END
$$;

DO $$
DECLARE
  relation_owner name;
BEGIN
  SELECT tableowner
  INTO relation_owner
  FROM pg_tables
  WHERE schemaname = current_schema()
    AND tablename = 'ai_chat_attachments';

  IF relation_owner IS NULL THEN
    CREATE TABLE ai_chat_attachments (
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
    CREATE INDEX ai_chat_attachments_scope_conversation_idx
      ON ai_chat_attachments (user_id, organization_id, conversation_id, created_at ASC);
  ELSIF relation_owner = current_user THEN
    CREATE INDEX IF NOT EXISTS ai_chat_attachments_scope_conversation_idx
      ON ai_chat_attachments (user_id, organization_id, conversation_id, created_at ASC);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ai_chat_attachments'
      AND column_name = 'organization_id'
      AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'ai_chat_attachments'
      AND indexname = 'ai_chat_attachments_scope_conversation_idx'
  ) THEN
    RAISE EXCEPTION
      'Migration 059 requires the ai_chat_attachments owner to install the complete AI schema before application startup';
  END IF;
END
$$;

DO $$
DECLARE
  relation_name text;
  relation_owner name;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['ai_conversations', 'ai_chat_attachments']
  LOOP
    SELECT tableowner
    INTO relation_owner
    FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename = relation_name;

    IF relation_owner = current_user THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation_name);
      EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', relation_name);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', relation_name);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', relation_name);
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = relation_name
        AND c.relrowsecurity
    ) OR EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants
      WHERE table_schema = current_schema()
        AND table_name = relation_name
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) THEN
      RAISE EXCEPTION
        'Migration 059 requires the owner of % to enable RLS and revoke direct client access before application startup',
        relation_name;
    END IF;
  END LOOP;
END
$$;
