ALTER TABLE notification_devices
  ADD COLUMN IF NOT EXISTS workspace_id text,
  ADD COLUMN IF NOT EXISTS auth_session_id text,
  ADD COLUMN IF NOT EXISTS notification_protocol_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS app_version text NOT NULL DEFAULT '';

UPDATE notification_devices AS device
SET workspace_id = users.organization_id
FROM users
WHERE device.user_id = users.id
  AND NULLIF(device.workspace_id, '') IS NULL
  AND NULLIF(users.organization_id, '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_devices_delivery_binding
  ON notification_devices(user_id, workspace_id, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_devices_auth_session
  ON notification_devices(user_id, auth_session_id)
  WHERE enabled = true;
