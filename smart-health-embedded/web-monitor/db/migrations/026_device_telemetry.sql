ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS telemetry jsonb NOT NULL DEFAULT '{}'::jsonb;
