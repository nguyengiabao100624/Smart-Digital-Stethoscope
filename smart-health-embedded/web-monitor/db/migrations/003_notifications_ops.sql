ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_notifications_delivery
  ON notifications(delivery_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_devices_user
  ON notification_devices(user_id, updated_at DESC);
