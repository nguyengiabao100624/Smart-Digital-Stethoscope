ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS user_id text REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text;

CREATE INDEX IF NOT EXISTS chat_messages_owner_workspace_created_idx
  ON chat_messages (user_id, organization_id, created_at)
  WHERE user_id IS NOT NULL AND organization_id IS NOT NULL;

-- Legacy rows without ownership remain preserved for forensic/manual review.
-- Production reads deliberately require both ownership columns and therefore
-- never return or send those unscoped rows to an AI provider.
