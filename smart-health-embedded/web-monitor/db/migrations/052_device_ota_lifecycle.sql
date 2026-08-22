-- Private, restart-safe OTA lifecycle. The JSON document contains only
-- allowlisted metadata and a one-way download token hash. Signed URLs,
-- plaintext tokens and signing material are transient and must never be stored.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS ota jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ota_status text NOT NULL DEFAULT '';

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_ota_object_check;

ALTER TABLE devices
  ADD CONSTRAINT devices_ota_object_check
  CHECK (jsonb_typeof(ota) = 'object');

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_ota_status_check;

ALTER TABLE devices
  ADD CONSTRAINT devices_ota_status_check
  CHECK (
    ota_status IN (
      '', 'pending', 'delivered', 'downloading', 'verifying', 'rebooting',
      'rolling_back', 'confirmed', 'rolled_back', 'failed', 'expired'
    )
  );

CREATE INDEX IF NOT EXISTS devices_active_ota_lifecycle_idx
  ON devices (ota_status, updated_at DESC)
  WHERE ota_status IN (
    'pending', 'delivered', 'downloading', 'verifying', 'rebooting', 'rolling_back'
  );

COMMENT ON COLUMN devices.ota IS
  'Private sanitized OTA lifecycle; never stores URL, plaintext token, signature or signing key';

COMMENT ON COLUMN devices.ota_status IS
  'Canonical OTA projection: pending through confirmed, rolled_back, failed or expired';
