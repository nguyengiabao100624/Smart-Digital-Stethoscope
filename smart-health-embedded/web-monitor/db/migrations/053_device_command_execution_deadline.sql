-- Delivery admission and long-running execution are separate deadlines. OTA
-- commands may continue after the device ACKs the short envelope TTL, but they
-- still require a durable terminal deadline so a lost device cannot block the
-- fleet forever.

ALTER TABLE device_commands
  ADD COLUMN IF NOT EXISTS execution_expires_at timestamptz;

-- Existing acknowledged/applying OTA work receives one bounded compatibility
-- window from deployment. It is neither expired immediately nor left unbounded.
UPDATE device_commands
SET execution_expires_at = GREATEST(expires_at, updated_at, now()) + interval '2 hours'
WHERE command_type = 'ota.update'
  AND state IN ('acknowledged', 'applying')
  AND execution_expires_at IS NULL;

ALTER TABLE device_commands
  DROP CONSTRAINT IF EXISTS device_commands_execution_expiry_check;

ALTER TABLE device_commands
  ADD CONSTRAINT device_commands_execution_expiry_check
  CHECK (execution_expires_at IS NULL OR execution_expires_at > expires_at);

CREATE INDEX IF NOT EXISTS device_commands_execution_expiry_idx
  ON device_commands (execution_expires_at)
  WHERE execution_expires_at IS NOT NULL
    AND state IN ('acknowledged', 'applying');

COMMENT ON COLUMN device_commands.execution_expires_at IS
  'Terminal execution/confirmation deadline after delivery ACK; currently required by OTA commands';
