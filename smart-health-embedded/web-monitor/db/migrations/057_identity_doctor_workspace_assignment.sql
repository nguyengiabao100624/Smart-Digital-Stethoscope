-- The Supabase runtime connection is intentionally not the owner of tables
-- created by the migration/bootstrap role, so this rollout must not ALTER an
-- existing constraint. The application keeps `doctor_workspace_assign` as
-- the logical operation and stores it under the already released
-- `change_role` database discriminator, with the logical kind bound inside
-- target_state. This migration is a durable rollout marker only.

SELECT 1;
