ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS push_attempts jsonb NOT NULL DEFAULT '[]'::jsonb;
