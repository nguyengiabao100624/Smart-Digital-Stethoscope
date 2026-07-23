WITH ranked_tokens AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY fcm_token
      ORDER BY enabled DESC, updated_at DESC, created_at DESC, id DESC
    ) AS token_rank
  FROM notification_devices
)
DELETE FROM notification_devices AS device
USING ranked_tokens AS ranked
WHERE device.id = ranked.id
  AND ranked.token_rank > 1;

ALTER TABLE notification_devices
  DROP CONSTRAINT IF EXISTS notification_devices_user_id_fcm_token_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_devices_fcm_token
  ON notification_devices(fcm_token);
