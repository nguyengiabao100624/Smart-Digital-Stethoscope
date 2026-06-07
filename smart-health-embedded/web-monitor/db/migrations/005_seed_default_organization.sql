INSERT INTO organizations (id, name, type, created_at, updated_at)
VALUES ('org_default_clinic', 'Smart Health Clinic', 'clinic', now(), now())
ON CONFLICT (id)
DO UPDATE SET
  name = COALESCE(NULLIF(organizations.name, ''), EXCLUDED.name),
  type = COALESCE(NULLIF(organizations.type, ''), EXCLUDED.type),
  updated_at = now();
