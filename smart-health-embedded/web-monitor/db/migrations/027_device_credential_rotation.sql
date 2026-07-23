-- Two-phase device credential rotation. This private document contains only
-- credential verification material (never a plaintext device credential).

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS credential_rotation jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_credential_rotation_object_check;

ALTER TABLE devices
  ADD CONSTRAINT devices_credential_rotation_object_check
  CHECK (jsonb_typeof(credential_rotation) = 'object');

CREATE INDEX IF NOT EXISTS devices_pending_credential_rotation_idx
  ON devices ((credential_rotation->>'state'), ((credential_rotation->>'expiresAt')::timestamptz))
  WHERE credential_rotation->>'state' IN ('initiated', 'pending_device_ack', 'confirming');
