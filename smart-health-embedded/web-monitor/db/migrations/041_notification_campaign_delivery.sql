ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS campaign_id text,
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS audience_role text,
  ADD COLUMN IF NOT EXISTS requested_channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  ADD COLUMN IF NOT EXISTS in_app_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'skipped',
  ADD COLUMN IF NOT EXISTS email_error_message text;

UPDATE notifications
SET
  requested_channels = CASE
    WHEN channel IN ('email', 'push') THEN jsonb_build_array(channel)
    ELSE '["in_app"]'::jsonb
  END,
  in_app_status = CASE WHEN channel = 'in_app' THEN 'ready' ELSE 'skipped' END,
  email_status = CASE
    WHEN delivery_status = 'email_sent' THEN 'sent'
    WHEN delivery_status = 'email_failed' THEN 'failed'
    WHEN channel = 'email' THEN COALESCE(NULLIF(delivery_status, ''), 'ready')
    ELSE 'skipped'
  END
WHERE campaign_id IS NULL
  AND audience_type = 'legacy';

CREATE INDEX IF NOT EXISTS idx_notifications_campaign
  ON notifications(campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_audience_delivery
  ON notifications(organization_id, audience_type, audience_role, created_at DESC);
