INSERT INTO organizations (id, name, type)
VALUES ('org_default_clinic', 'Smart Health Clinic', 'clinic')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  updated_at = now();

INSERT INTO users (
  id, role, name, email, phone, password_hash, license, hospital, department,
  address, organization_id, verified_email, verified_phone
)
VALUES
  (
    'usr_doctor_default',
    'doctor',
    'Bs. Tuan',
    'bacsytuan@benhvien.com',
    '0912345678',
    'demo-password-12345678',
    '123456/BYT-CCHN',
    'Benh vien Da khoa Trung uong',
    'Khoa Tim mach',
    'Ha Noi',
    'org_default_clinic',
    true,
    true
  ),
  (
    'usr_patient_default',
    'patient',
    'Nguyen Van A',
    'nguyenvana@gmail.com',
    '0900000000',
    'demo-password-12345678',
    null,
    null,
    null,
    'Ho Chi Minh',
    'org_default_clinic',
    true,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  organization_id = EXCLUDED.organization_id,
  updated_at = now();

INSERT INTO patients (
  id, organization_id, owner_user_id, patient_code, name, age, gender, phone, email, address, notes
)
VALUES (
  'pat_default_patient',
  'org_default_clinic',
  'usr_patient_default',
  'SELF-default',
  'Nguyen Van A',
  35,
  'male',
  '0900000000',
  'nguyenvana@gmail.com',
  'Ho Chi Minh',
  'Ho so demo cho ung dung Android'
)
ON CONFLICT (id) DO UPDATE SET
  owner_user_id = EXCLUDED.owner_user_id,
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  updated_at = now();

UPDATE users
SET patient_id = 'pat_default_patient', updated_at = now()
WHERE id = 'usr_patient_default';

INSERT INTO memberships (id, organization_id, user_id, role)
VALUES
  ('mbr_doctor_default', 'org_default_clinic', 'usr_doctor_default', 'doctor'),
  ('mbr_patient_default', 'org_default_clinic', 'usr_patient_default', 'patient')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO doctor_patient_access (
  id, doctor_user_id, patient_id, organization_id, access_level, granted_by_user_id
)
VALUES (
  'dpa_default',
  'usr_doctor_default',
  'pat_default_patient',
  'org_default_clinic',
  'write',
  'usr_patient_default'
)
ON CONFLICT (doctor_user_id, patient_id) DO UPDATE SET
  access_level = EXCLUDED.access_level,
  revoked_at = null;

INSERT INTO devices (
  id, organization_id, paired_user_id, name, type, status, signal, battery, connected, connection_method
)
VALUES
  (
    'esp32-stethoscope',
    'org_default_clinic',
    'usr_patient_default',
    'StethoEdge Pro',
    'stethoscope',
    'connected',
    -45,
    85,
    true,
    'QR'
  ),
  (
    'lite-steth-a92',
    'org_default_clinic',
    null,
    'LiteSteth-A92',
    'stethoscope',
    'available',
    -68,
    72,
    false,
    'Bluetooth'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  signal = EXCLUDED.signal,
  battery = EXCLUDED.battery,
  connected = EXCLUDED.connected,
  connection_method = EXCLUDED.connection_method,
  updated_at = now();

INSERT INTO app_settings (id, value)
VALUES (
  'default',
  '{
    "notifications": {
      "enabled": true,
      "sound": true,
      "vibration": true,
      "abnormalResults": true,
      "deviceConnection": true,
      "appointments": true,
      "aiUpdates": false,
      "messages": true
    },
    "privacy": {
      "biometric": true,
      "twoFactor": false,
      "encryption": true
    },
    "stethoscope": {
      "volume": 75,
      "sensitivity": 60,
      "noiseCancel": true,
      "autoConnect": true
    },
    "ai": {
      "selectedModel": "balanced",
      "version": "AI Medical Analysis v3.2.1"
    }
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
