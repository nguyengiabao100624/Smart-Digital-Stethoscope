# Smart Health - Prompt Requirements Handoff

Last updated: 2026-07-09

Source prompt: `C:\Users\baobe\.codex\attachments\05fe3f5d-461a-44e0-a201-f791d201f845\pasted-text.txt`

Purpose: preserve the requirements, closed slices, blockers, and next work from the broad "finish Smart Health as a real product" prompt so future chats do not repeat already deployed work.

## Product Invariants

- Smart Health is the whole `D:\Study\KLTN` system: backend/API, production firmware, Android app, Shcare Web portal, Platform Admin UI, Firebase, Render, Supabase/Postgres/storage, CI/deploy tooling, smoke tests, and docs. Do not scope future work to a single folder if the workflow depends on adjacent surfaces.
- Every product change should preserve cross-surface consistency: backend policy and data model, Firebase role/session behavior, web/admin/Android client logic, firmware/device protocol when relevant, production provider behavior, smoke coverage, deploy notes, and handoff docs.
- `shcare-admin.web.app` is Platform Admin only. It approves and audits platform/workspace/doctor onboarding, but it is not the daily clinic operations portal.
- `shcare.web.app` is the Workspace Portal for workspace owners, clinics, hospitals, solo doctors, and doctors with portal membership.
- Android remains the primary patient/personal/family app and can support doctor mobile workflows, but clinic administration is web-first.
- Shcare Web `/register/phong-kham` creates a workspace-owner/workspace request through `/api/auth/workspace-request`.
- Doctor registration creates a doctor role request through `/api/auth/role-request`.
- Platform Admin approves workspace/facility owners through the workspace approval lifecycle and doctors through the doctor approval lifecycle; those workflows must stay distinct.
- Approval grants backend role, workspace membership, allowed surfaces, default surface, and Firebase custom claims when Firebase Admin is available.
- Pending, needs-info, and rejected accounts must not access protected portal/admin features. They should land on the correct status or resubmit flow.
- Wrong-surface login must be explicit: platform admins go to Admin, workspace/doctor portal users go to Shcare Web, Android-only or patient accounts are rejected from admin/portal where unsupported.
- Backend role, workspace, tenant isolation, device ownership, scan sharing, export scope, and notification target policy are authoritative. Clients do not self-assign role or workspace.
- Devices move through provision, claim, assign, revoke/rotate, heartbeat/events, and OTA flows. Before claim they are platform/provisioned inventory; after claim they belong to a workspace and can be assigned to a patient according to backend policy.
- `MSM261S4030H0` is the only active production firmware target. INMP441 is retired from current Smart Health product work.

## Repo Map For This Prompt

This map is a product-system map. Use it to decide which adjacent apps/services must be updated together for a workflow, not as separate isolated projects.

- Backend/API: `smart-health-embedded/web-monitor`
- Firmware/device: `smart-health-embedded/MSM261S4030H0`
- Android: `smart-health-android`
- Shcare Web portal: `smart-health-web`
- Platform Admin UI: `smart-health-admin/thiet ke giao dien` in the Vietnamese-named folder
- Handoff docs: `docs/SMART_HEALTH_PROJECT_INDEX.md`, `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md`, `docs/SMART_HEALTH_IMPLEMENTATION_STATUS.md`, `docs/SMART_HEALTH_PRODUCTION_BACKLOG.md`, `docs/SMART_HEALTH_COMMANDS_GUIDE.md`

## Closed Slices From This Prompt

Do not repeat these as unresolved unless new evidence regresses them.

| Slice | Status | Evidence |
| --- | --- | --- |
| Phase 0 project intake | Closed | `AGENTS.md`, `smart-health-project`, focused handoff docs, `context-budget`, `strategic-compact`, `impeccable`, and `gpt-taste` were loaded before edits. |
| Phase 1 product invariants | Closed | Invariants above match current docs and deployed role/surface model. |
| Phase 2 baseline verification | Closed for current deployed source | The current deployed source was verified through backend, web, admin, Android, firmware, live portal, and live admin smoke commands listed below. |
| First requested slice: Role/Auth/Register/Approval/RBAC | Closed in deployed source | Backend/source commit `88877ad5` and docs commit `b12a16f6` are pushed to `origin/main`; Render auto-deploy path was verified by live health and smoke. |
| Workspace owner approval lifecycle | Closed in deployed source | `/register/phong-kham` maps to workspace-owner request, Admin workspace approval handles pending/needs-info/rejected/approved, and approval grants portal access. |
| Wrong-surface guard | Closed in deployed source | Production role and portal smokes verify platform-admin portal rejection plus workspace-admin/doctor portal access. |
| Account profile tenant hardening | Closed in deployed source | `/api/v1/me` no longer allows profile self-switch or membership creation by sending display workspace text. |
| Supabase/Postgres repository parity probe | Closed in deployed source and Supabase metadata | Commit `6d902355` is pushed; Supabase connector verified migrations/RLS/no direct client grants, found the runtime snapshot drift, and confirmed runtime/normalized org counts are now synced after deploy. |
| Storage/signed URL backend contract | Closed locally for JSON/API contract | `smoke:workspace-access` now covers storage share URL, download content, cross-workspace signed URL denial, upload/list/download/delete, and post-delete 404. |
| Shcare Web performance regression smoke | Closed on live site | `bun run smoke:performance` measures public home/login and authenticated portal routes with Playwright performance budgets and passed against `https://shcare.web.app`. |
| Web Admin device mutation hydration regression | Closed in deployed source | Commit `27f309be` preserves runtime-created patients/devices during SQL-backed list hydration; live `smoke:admin-mutation` run `admin-mutation-mran2ji6` passed with device PATCH 200 and full cleanup. |
| Device transfer hardening | Closed in deployed source | Backend validates target workspace and target owner membership before transfer. |
| Selected scan sharing hardening | Closed in deployed source | Scan listing now filters with `canAccessScan`, so selected-scan grants do not leak sibling scans. |
| Notification target scoping | Closed in deployed source | Non-platform notification creation can target only self or same-workspace users. |
| Export workspace validation | Closed in deployed source | Platform exports reject missing target workspaces; workspace exports stay forced to caller workspace. |
| Android/backend AI and data contract sync | Closed locally in source | `/api/v1/ai/chat`, `/api/v1/ai/settings`, `/api/v1/ai/update`, `/api/v1/settings/ai/update`, and `/api/v1/data/cache` now use caller user/workspace scope, and `smoke:workspace-access` covers the regression cases. |
| Live UI dead-control/mobile overflow pass | Closed in deployed source | Live portal/admin mutation smokes passed and a 390x844 no-overflow pass found no console/page errors on key surfaces. |
| Firebase Hosting deploy | Closed | Shcare Web version `projects/162993928259/sites/shcare/versions/fab6a2ad97c63420`, release `projects/162993928259/sites/shcare/channels/live/releases/1783411275583000`; Web Admin version `projects/162993928259/sites/shcare-admin/versions/ce26044bb3730062`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783411298455000`. |
| Shcare Portal account settings | Closed in deployed source | `/portal/settings` now covers profile/avatar/password/2FA/sessions/notifications/workspace settings and live mutation run `portal-mutation-mrclugrb` passed with cleanup. |
| Shcare Portal consent/share workflow | Closed in deployed source | `/portal/consent` now creates and revokes real patient-share grants with full-profile/selected-scan scope and optional expiry. Live Firebase version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`; live mutation run `portal-mutation-mrcnnzcg` created/revoked share `share_20260708223625_e69f019e`. |
| Patient-share repository persistence | Closed for source/API live consistency; DB row proof pending | Backend source now has SQL-backed `repositories.patientShares`; portal share routes use repository list/find/save/revoke when available; Supabase project `mahvymyncxszvuhlycwp` has app migration `009_doctor_patient_access_runtime_parity` applied and verified. Follow-up `c00f35f3` is pushed, live API direct canary and portal mutation smoke verify create-list-revoke consistency, but row-level proof for newly-created live Supabase rows still needs DB/log access. |
| Android Data Access consent history | Closed in source/build | Android `/settings -> privacy -> data-access` no longer uses local-only switches; it loads backend patient profiles/share grants/share targets, shows active/revoked consent history, and can revoke active grants through `DELETE /api/patients/:id/shares/:shareId`. Kotlin compile and debug assemble passed. |

## Verification Ledger

- Backend local: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, `npm.cmd run smoke:notification-push`, `npm.cmd run smoke:storage`
- Web local: `bunx tsc --noEmit --pretty false`, `bun run lint`, `bun run build:firebase`
- Admin local: `npm.cmd run lint`, `npm.cmd run build:firebase:admin`
- Android local: `.\gradlew.bat :app:compileDebugKotlin`
- Live Render/Firebase: `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`
- Live Shcare Web: `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` with run id `portal-mutation-mrad4yzw`; cleanup succeeded.
- Live Web Admin: `npm.cmd run smoke:admin-mutation` with run id `admin-mutation-mrad8n0r`; cleanup succeeded.
- Live mobile/overflow: custom Playwright 390x844 pass reported `overflow=0` and no console/page errors across public/auth, authenticated portal, and authenticated admin key routes.
- Next-slice production gate probe on 2026-07-07: local PowerShell env presence check reported `MISSING` for `AUTH_MODE`, `FIREBASE_AUTH_ENABLED`, `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_SERVICE_ACCOUNT_JSON`, public backend URL envs, `DATA_BACKEND`, `DATABASE_URL`, `OBJECT_STORAGE_PROVIDER`, `PHI_ENCRYPTION_KEY`, and Brevo envs. `npm.cmd run check:production:strict` returned `BLOCKED` with pass=3, warn=6, fail=7, manual=2. This is a local-shell/env access blocker, not proof that Render/Firebase/Supabase were never configured.
- Supabase connector probe on 2026-07-07: project `smart-health-production` (`mahvymyncxszvuhlycwp`) is healthy on Postgres 17.6, migrations `001_init` through `008_notification_push_attempts` are applied, public tables have RLS enabled, `anon` and `authenticated` have no direct public table grants, and `app_runtime_state` showed one stale organization count drift (`9` runtime vs `10` normalized SQL).
- Backend local after repository hardening: `node --check src\repositories.js`, `node --check scripts\repositoriesSmokeTest.js`, `npm.cmd run smoke:repositories`, `npm.cmd run check`, and `npm.cmd run smoke:workspace-access` passed.
- Backend deploy/live after commit `6d902355`: `git push origin main` succeeded, `npm.cmd run smoke:public-deployment` passed, `npm.cmd run smoke:portal-production` passed, and Supabase `app_runtime_state` now reports `runtime_organizations=10` / `normalized_organizations=10`.
- Storage/performance follow-up on 2026-07-07: `node --check scripts\workspaceAccessSmokeTest.js`, `npm.cmd run smoke:workspace-access`, `node --check scripts\performanceSmokeTest.mjs`, and `bun run smoke:performance` passed. Live performance results stayed within budgets; public home transferred about 4.45 MB because of visual media, and authenticated portal routes loaded in about 0.4-1.3 seconds after login.
- Storage/performance deploy follow-up: commit `edd419ef` was pushed to `origin/main`, then live `npm.cmd run smoke:public-deployment` and `npm.cmd run smoke:portal-production` passed.
- Repository/admin mutation follow-up on 2026-07-07: whole-system verification found live `smoke:admin-mutation` failing at device PATCH 404 after provisioning. Commit `27f309be` fixed repository list hydration for runtime-created patients/devices, then `npm.cmd run smoke:public-deployment` and live Web Admin `npm.cmd run smoke:admin-mutation` passed with run id `admin-mutation-mran2ji6`.
- Firebase live smoke refresh on 2026-07-07: after explicitly loading `FIREBASE_PROJECT_ID=smart-health-stethoscope` and the local Firebase Admin JSON path, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`, `npm.cmd run smoke:firebase-email`, and `npm.cmd run smoke:public-deployment` passed.
- Device availability probe on 2026-07-07: Android SDK `adb.exe devices` showed no attached devices, and PlatformIO `device list` showed no ESP32-S3 serial device. Real Android FCM and physical MSM261 validation remain blocked by missing connected hardware/device token, not by source code in this slice.
- Provider/hardware re-probe on 2026-07-07: network-enabled local verification passed backend `check`, `test`, `smoke:firebase-email`, `smoke:storage`, `smoke:notification-push`, `smoke:public-deployment`, `smoke:production-roles`, `smoke:portal-production`, `smoke:workspace-access`, `smoke:repositories`, and `smoke:api-production`; `smoke:mqtt` skipped because `MQTT_URL` is unset. `smoke:firebase-email` proves Firebase link generation for `https://shcare.web.app/xac-nhan-email`, not Gmail inbox click-through. Live Shcare/Web Admin mutation/build verification passed with `portal-mutation-mraqouwy` and `admin-mutation-mraqkmzo`. Android debug/release builds and MSM261 PlatformIO normal/OTA builds passed. `npm.cmd run check:production` still reports local env `BLOCKED`; Gmail was not signed in, `adb devices` showed no attached device, and PlatformIO returned no ESP32-S3 serial device.
- Android/backend AI and data contract sync on 2026-07-07: backend `npm.cmd run check`, `npm.cmd run smoke:workspace-access`, and `npm.cmd test` passed after adding regression coverage for AI chat tenant isolation, AI settings/update workspace persistence, scoped AI update notifications, scoped Android data cache summary, and destructive data reset denial. Cross-surface builds also passed: Shcare Web `npm.cmd run build`, Web Admin `npm.cmd run build`, and Android `.\gradlew.bat :app:assembleDebug`.
- Portal consent/share follow-up on 2026-07-09: Shcare Web `bunx tsc --noEmit --pretty false`, `bun run lint`, `bun run build`, `bun run build:firebase`, targeted `git diff --check`, local preview browser/mutation smokes with `SMOKE_DISABLE_WEB_SECURITY=1`, Firebase deploy target `webapp`, live `bun run smoke:portal-browser`, and live `bun run smoke:portal-mutation` run `portal-mutation-mrcnnzcg` all passed. The live mutation run created patient `pat_20260708223500_794d8928`, created share `share_20260708223625_e69f019e`, revoked it, deleted the patient, and restored device/settings/notification/support side effects.
- Patient-share repository follow-up on 2026-07-09: Supabase schema inspection before migration showed the old `doctor_patient_access` shape; Supabase migration `doctor_patient_access_runtime_parity` then applied successfully and app `schema_migrations` now includes `009_doctor_patient_access_runtime_parity`. Post-migration inspection confirmed nullable `doctor_user_id`, `doctor_id`, `scope`, JSONB `scan_ids`, `revoked_by_user_id`, `updated_at`, revoke FK, and patient/doctor/workspace indexes. Backend local verification passed with `node --check src\repositories.js`, `node --check server.js`, `node --check scripts\migrateJsonToPostgres.js`, `node --check scripts\repositoriesSmokeTest.js`, `npm.cmd run smoke:repositories`, `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run smoke:workspace-access`.
- Share create/list regression caught on 2026-07-09 after commit `18534eba`: live portal mutation smoke timed out on new share row `share_20260708230629_cd3483bf`, and direct API canary showed POST-created share `share_20260708230839_6f6a3512` was not returned by immediate `GET /shares`. The source fix merges runtime shares with SQL rows in `patientShares.listForPatient`, adds a create-then-list repository smoke assertion, and optimistically inserts created shares into the portal cache.
- Share create/list deploy follow-up on 2026-07-09: commit `c00f35f3` was pushed to `origin/main`, Shcare Web deployed version `projects/162993928259/sites/shcare/versions/9109e5cb08b4fd0d`, and live verification passed with `npm.cmd run smoke:public-deployment`, direct canary `direct-share-mrcphdbi-1` (`share_20260708232540_f6af5d2b` visible in immediate `GET /shares`), `npm.cmd run smoke:portal-production`, and `bun run smoke:portal-mutation` run `portal-mutation-mrcpi0yj` (`share_20260708232751_88243994` created/revoked).
- Android Data Access consent history on 2026-07-09: `DataAccessScreen.kt` now uses backend `listPatients`, `listPatientShares`, `listShareTargets`, and new `revokePatientShare`; `PatientShare` carries history metadata; `.\gradlew.bat :app:compileDebugKotlin` and `.\gradlew.bat :app:assembleDebug` passed.

## Current Severity Checklist

### Blocker

- Real physical MSM261 ESP32-S3 board validation still requires connected hardware for WiFi, heartbeat, audio, cloud command, and OTA serial evidence.

### High

- Real Android FCM delivery needs a real device token against Render. Local/no-Firebase push persistence and backend retry paths are covered, but user-visible delivery on a device is not closed; this shell currently lacks usable `adb.exe`/attached Android device access.
- Production email verification should still be checked through a real inbox click-through, not only Firebase link generation or Render/Brevo provider `sent` status. Gmail was not signed in during the latest browser probe.
- Production S3/Supabase Storage provider smoke still needs the real object-storage env loaded into the process running the smoke. Local API coverage now covers signed URL/download/upload/delete/scoping behavior, and local `smoke:storage` still passes.

### Medium

- Account settings and notification preference behavior should keep getting expanded with browser-level mutation coverage for every dialog/form field. Backend source-level AI settings/update notification scope is covered locally; remaining work here is browser-level UX breadth, not the AI/data endpoint contract fixed on 2026-07-07.
- Patient/family profile flows still need production-like workspace/personal/family data checks. Android patient-facing consent history is source/build closed; real device UI proof remains tied to attached Android hardware. The workspace portal grant/revoke workflow itself is covered by live browser/mutation smoke as of 2026-07-09.

### Polish

- Some source paths, component names, and docs still carry legacy `Clinics` wording for workspace management compatibility. Do not rename broadly unless the next slice needs it.
- Android Compose icon deprecation warnings remain non-blocking until the dependency set supports the replacement icons cleanly.

## Next Practical Slice

Recommended next non-repeated slice:

1. Move to provider/device validation that still needs outside evidence: real Android FCM delivery, real inbox click-through for email verification, production S3/Supabase Storage provider smoke, and physical MSM261 ESP32-S3 WiFi/audio/OTA validation.
2. Continue browser-level patient/family profile, patient-facing consent history, and notification-preference breadth when provider/device gates are not available.
3. Do not repeat the closed Role/Auth/Register/Approval/RBAC, Supabase/Postgres repository-parity, local storage API, or live performance slices unless new regression evidence appears.

## Handoff Rule

When another slice is completed, append it here with commit/version/run ids and cleanup result, then update:

- `docs/SMART_HEALTH_PROJECT_INDEX.md`
- `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `docs/SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `docs/SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `docs/SMART_HEALTH_COMMANDS_GUIDE.md` only if commands/env/runbooks changed
