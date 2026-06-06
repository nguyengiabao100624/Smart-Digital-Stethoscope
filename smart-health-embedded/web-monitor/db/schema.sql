-- Canonical PostgreSQL schema for the production backend.
-- Runtime migrations live in db/migrations/*.sql and are applied by:
--   npm run migrate
--
-- This file intentionally points to the versioned migration instead of
-- duplicating table definitions. Keep migration files as the source of truth
-- so deploys, local dev, and documentation do not drift.

\i db/migrations/001_init.sql
