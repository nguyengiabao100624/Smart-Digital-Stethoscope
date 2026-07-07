ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS push_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_error_message text;

CREATE INDEX IF NOT EXISTS idx_notifications_push_delivery
  ON notifications(push_status, updated_at DESC);
