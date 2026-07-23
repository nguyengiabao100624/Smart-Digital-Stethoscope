# Smart Health - Prompt Requirements Handoff

Last updated: 2026-07-23

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

## KLTN Thesis Gate - Current Main Priority

When the user says to focus the "main" work and leave product-development goals for later, use `docs/SMART_HEALTH_KLTN_REPORT_COMPLETION_PLAN.md` before adding new product modules. That file is the KLTN/report gate and records the required thesis deliverables.

Mandatory KLTN focus before more production-direction development:

- Keep the scope framed as a working end-to-end prototype: ESP32-S3 + MSM261S4030H0 MEMS/I2S microphone, realtime audio path, backend scan/session API, Android app, web admin/workspace portal direction, and basic AI/TinyML/chatbot support.
- Use `docs/khoaluan` as the KLTN contract pack before adding more production-direction modules. It contains the shared system contract, audio packet/WebSocket contract, demo evidence checklist, and KLTN test/gap matrix.
- Separate report claims into implemented demo, partial/scaffold, and future production/clinical work.
- Finish/report evidence for firmware build, backend checks and runtime smoke, Android build/screenshots, web/admin build/screenshots, saved audio/waveform evidence, and a clear end-to-end demo path.
- Do not overclaim medical certification, diagnostic accuracy, UDP production security, JSON demo persistence, chatbot medical advice, or device quota as patient capacity.
- Treat missing physical ESP32-S3 serial/audio proof, deeper authenticated Android screenshots, and a fresh physical-device end-to-end audio session as KLTN evidence gaps, not optional polish.
- Only after the KLTN evidence/report gate is closed should the next chat return to production-direction work such as MQTT control plane, authenticated WSS/HTTPS scan transport, production PostgreSQL/object storage hardening, secure provisioning, or provider integrations.

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
| Shcare Portal UI density/search-field polish | Closed in deployed source | Search icons no longer overlap placeholders on Patients/Records/Audit/Help, portal titles/inputs/buttons/tables use a normalized compact clinical density, commit `ff9adec5` is pushed, Firebase release `1783594254847000` is live, local/live portal browser plus visual QA passed, and a 19-route live density sweep found no failing routes. |
| Web Admin production backend guard | Closed in deployed source | Web Admin production builds now reject retired `smart-health-api-xj0a` URLs and require API base parity with the active `smart-health-api-r5is` backend. Firebase Hosting `shcare-admin` version `projects/162993928259/sites/shcare-admin/versions/0d796ccc2368d21e`, release `1783598280968000`, is live and `npm.cmd run smoke:admin-mutation` passed with run id `admin-mutation-mrdgdbok`. |
| Shcare Portal workspace summary contract | Closed in deployed source | `/portal/workspace` no longer maps workspace counters to hardcoded zero. Backend `/me` returns scoped patient/device/online/alert/scan summaries for current workspace and memberships; live portal browser smoke asserts workspace cards and numeric summaries. Commit `2b3d21a3`, Firebase release `1783592537850000`, and mutation run `portal-mutation-mrdczthd` verify production. |
| Shcare Portal consent/share workflow | Closed in deployed source | `/portal/consent` now creates and revokes real patient-share grants with full-profile/selected-scan scope and optional expiry. Live Firebase version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`; live mutation run `portal-mutation-mrcnnzcg` created/revoked share `share_20260708223625_e69f019e`. |
| Patient-share repository persistence | Closed for source/API live consistency; DB row proof pending | Backend source now has SQL-backed `repositories.patientShares`; portal share routes use repository list/find/save/revoke when available; Supabase project `mahvymyncxszvuhlycwp` has app migration `009_doctor_patient_access_runtime_parity` applied and verified. Follow-up `c00f35f3` is pushed, live API direct canary and portal mutation smoke verify create-list-revoke consistency, but row-level proof for newly-created live Supabase rows still needs DB/log access. |
| Android Data Access consent history | Closed in source/build/backend-smoke | Android `/settings -> privacy -> data-access` no longer uses local-only switches; it loads backend patient profiles/share grants/share targets, shows active/revoked consent history, and can revoke active grants through `DELETE /api/patients/:id/shares/:shareId`. Backend `GET /patients/:id/shares` now includes revoked grants for history, and `smoke:workspace-access` covers patient/family profile isolation plus consent create/list/revoke. Kotlin compile and debug assemble passed. |
| Android change password backend bridge | Closed in source/build/backend-smoke | Android `/settings -> privacy -> change-password` now updates Firebase, refreshes the ID token, and records the change through backend `/me/password` with `firebaseClientUpdated=true`; demo/backend sessions still use current/new password directly. `smoke:workspace-access` verifies backend patient password change plus old-password rejection/new-password login. |
| Android Privacy 2FA backend bridge | Closed in source/build/backend-smoke for setup state | Android `/settings -> privacy` now loads and updates backend `/me/2fa`, shows recovery codes returned by the backend, and disables biometric clearly until native BiometricPrompt exists. `smoke:workspace-access` verifies patient 2FA enable/disable and recovery-code response. Real OTP provider/enforcement remains a provider/backend follow-up. |
| Android Privacy auth session management | Closed in source/build/backend-smoke | Android `/settings -> privacy` now lists backend auth sessions from `/auth/sessions`, marks the current session, and revokes non-current sessions through the backend. Backend demo auth fallback no longer turns an invalid/revoked bearer token into the default platform admin user. `smoke:workspace-access` verifies patient session list/revoke and revoked-token denial. |
| Android family profile management | Closed in source/build/backend-smoke | Android Settings now has `Hồ sơ gia đình` for backend-backed family/dependent profile list/create/update/delete. `SmartHealthApi` supports patient update/delete, and `smoke:workspace-access` verifies patient dependent profile create/update/delete plus cross-workspace update denial. |
| Android workspace switcher and dashboard context | Closed in source/build/backend-smoke | Android now parses backend `currentWorkspace`, `currentMembership`, and `memberships`, Settings has a real workspace switcher route, doctor/patient dashboards show current workspace context, and `smoke:workspace-access` verifies a joined doctor can switch workspace through `/api/v1/me` and switch back. |
| Backend audio worker queue persistence | Closed in source/build/backend-smoke | `src/audioProcessingWorker.js` persists queued audio processing output into scan/audio/AI repositories; `scripts/worker.js` now uses the same data-store/repository/storage path instead of only logging results; backend complete/reprocess avoids duplicate inline + queued processing when Redis enqueue succeeds. Verified with backend `npm.cmd test`, `npm.cmd run check`, `npm.cmd run smoke:workspace-access`, and no-Redis worker startup. Live Redis/BullMQ runtime proof remains pending. |
| Shcare Portal appointments/consultations | Closed in deployed source and production schema | `/api/v1/appointments`, `/api/portal/appointments`, and `/portal/appointments` now exist with scoped CRUD, validation, role capabilities, audit/notification side effects, JSON/SQL repository support, migration `010_appointments.sql`, browser/performance smoke route coverage, and backend workspace smoke for list/create/confirm/delete/cross-workspace denial. Supabase migration `20260710054623 appointments` is applied and verified on project `mahvymyncxszvuhlycwp`; commit `b9a6d4cb` is pushed; Firebase `shcare` release `1783662693801000` is live; live mutation run `portal-mutation-mreisktg` created/confirmed/deleted appointment `appt_20260710055434_71922d95` with cleanup. |
| KLTN unified contract pack | Closed in docs/source-contract smoke | `docs/khoaluan` now holds the thesis system contract, PCM16/WebSocket audio contract, demo evidence checklist, and KLTN test/gap matrix. Backend `npm.cmd run smoke:klt-contract` verifies the docs exist and firmware/backend/Android source still matches the documented core audio contract. Additional source/build verification passed with backend `npm.cmd run check`, MSM261 PlatformIO normal/OTA builds, and Android `compileDebugKotlin`. Physical board and Android device runtime proof remain separate blockers. |

## Verification Ledger

- Backend local: `npm.cmd run smoke:klt-contract`, `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, `npm.cmd run smoke:notification-push`, `npm.cmd run smoke:storage`
- Web local: `bunx tsc --noEmit --pretty false`, `bun run lint`, `bun run build:firebase`
- Admin local: `npm.cmd run lint`, `npm.cmd run build:firebase:admin`
- Android local: `.\gradlew.bat :app:compileDebugKotlin`
- Live Render/Firebase: `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`
- Live Shcare Web: `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` with run id `portal-mutation-mrad4yzw`; cleanup succeeded.
- Live Web Admin: `npm.cmd run smoke:admin-mutation` with run id `admin-mutation-mrdgdbok`; cleanup succeeded.
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
- Patient/family backend contract follow-up on 2026-07-09: backend `GET /api/v1/patients/:id/shares` now returns revoked grants through repository `includeRevoked` and JSON fallback parity; `smoke:workspace-access` now logs in a personal patient account, verifies self/dependent profile isolation, dependent creation, share-target lookup, patient consent create/list/revoke, revoked consent history, and denial of workspace-owned patient profiles. Verification passed with `node --check server.js`, `node --check scripts\workspaceAccessSmokeTest.js`, `npm.cmd run smoke:workspace-access`, `npm.cmd run check`, `npm.cmd run smoke:repositories`, and `npm.cmd test`. Commit `fde6ae4c` was pushed; live `smoke:public-deployment` passed and `smoke:portal-production` passed on rerun after one transient Render 502.
- Android account password bridge on 2026-07-09: `ChangePasswordScreen.kt` now follows the same Firebase-client-plus-backend-audit contract as the web/admin account settings flow; `SmartHealthApi.changePassword` carries `firebaseClientUpdated`; `smoke:workspace-access` now proves backend password change/re-login for the seeded patient account. Verification passed with Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, backend `node --check scripts\workspaceAccessSmokeTest.js`, and backend `npm.cmd run smoke:workspace-access`.
- Android Privacy 2FA bridge on 2026-07-09: `PrivacyScreen.kt` no longer uses a local-only 2FA toggle; `SmartHealthApi.updateTwoFactor` calls `/me/2fa`; `AuthUser` parses backend 2FA state; the UI shows recovery codes returned after enable and marks biometric as unavailable instead of acting like a working toggle. Verification passed with Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, backend `npm.cmd run smoke:workspace-access`, and backend `npm.cmd run check`.
- Android Privacy auth session bridge on 2026-07-09: `PrivacyScreen.kt` now shows backend auth sessions and revokes non-current sessions; `SmartHealthApi` exposes `/auth/sessions` list/revoke; backend demo fallback rejects invalid/revoked bearer tokens instead of falling back to platform admin. Verification passed with backend `node --check server.js`, backend `node --check scripts\workspaceAccessSmokeTest.js`, backend `npm.cmd run smoke:workspace-access`, backend `npm.cmd run check`, Android `.\gradlew.bat :app:compileDebugKotlin`, and Android `.\gradlew.bat :app:assembleDebug`.
- Android family profile management on 2026-07-09: `FamilyProfilesScreen.kt` adds Settings -> `Hồ sơ gia đình`; `SmartHealthApi.updatePatient/deletePatient` call backend patient APIs; `smoke:workspace-access` now proves patient dependent profile create/update/delete and cross-workspace update denial. Verification passed with Android `.\gradlew.bat :app:compileDebugKotlin`, backend `node --check scripts\workspaceAccessSmokeTest.js`, and backend `npm.cmd run smoke:workspace-access`.
- Shcare Portal workspace summary contract on 2026-07-09: backend `/me` now returns operational workspace summaries for currentWorkspace and memberships, Shcare Web maps them into `/portal/workspace`, and browser/backend smokes cover the contract. Source verification passed with backend syntax checks, `npm.cmd run smoke:workspace-access`, `npm.cmd run check`, Shcare Web typecheck/lint/build, and local dev `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-browser`. Production follow-up pushed commit `2b3d21a3`, deployed Firebase Hosting version `projects/162993928259/sites/shcare/versions/4f370368cfbe2403`, release `projects/162993928259/sites/shcare/channels/live/releases/1783592537850000`, then passed `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:portal-production`, live `bun run smoke:portal-browser` without local CORS bypass, and live `bun run smoke:portal-mutation` run `portal-mutation-mrdczthd` with cleanup OK.
- Shcare Portal UI density/search-field polish on 2026-07-09: `clinical-system.css` now normalizes portal dashboard typography, inputs, buttons, table cells, and `.portal-search-field`; Patients, Records, Audit Log, and Help use the shared search layout so icons do not overlap placeholders. Verification passed with Shcare Web `bunx tsc --noEmit --pretty false`, `bun run lint`, `bun run build:firebase`, local and live `bun run smoke:portal-browser`, `npm.cmd run smoke:public-deployment`, and targeted Playwright visual QA measuring `21.44px` portal titles, `44px` search inputs, `14px` input text, `43.2px` search padding, about `12.809px` icon-to-text gap, and zero checked overflow. Commit `ff9adec5` was pushed and Firebase Hosting release `projects/162993928259/sites/shcare/channels/live/releases/1783594254847000` is live.
- Android workspace switcher and dashboard context on 2026-07-09: Android `AuthUser` now parses `/me` `currentWorkspace`, `currentMembership`, and `memberships`; Settings routes to `WorkspaceSwitcherScreen.kt`; doctor/patient dashboards show current workspace context; `SmartHealthApi.switchWorkspace()` uses backend `/api/v1/me` membership enforcement. Backend smoke now verifies a joined doctor can switch to `org_beta`, receive beta operational summary/currentMembership, and switch back to `org_alpha`. Verification passed with backend `node .\scripts\workspaceAccessSmokeTest.js`, Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, and Android `.\gradlew.bat :app:testDebugUnitTest`.
- Shcare Portal appointments follow-up on 2026-07-10: initial RED backend `smoke:workspace-access` failed on missing `/api/portal/appointments`; then backend `npm.cmd run smoke:workspace-access`, `npm.cmd test`, `npm.cmd run check`, `npm.cmd run smoke:repositories`, Shcare Web `npm.cmd run lint`, `.\node_modules\.bin\tsc.exe --noEmit`, `npm.cmd run build`, `npm.cmd run build:firebase`, and `node --check scripts/portalMutationSmokeTest.mjs` passed. Local Vite returned 200 at `/portal/appointments`. Supabase connector applied migration `20260710054623 appointments`, commit `b9a6d4cb` was pushed, Firebase `shcare` release `1783662693801000` went live, and live `smoke:portal-browser` plus `smoke:portal-mutation` run `portal-mutation-mreisktg` verified appointment create/list/confirm/delete.
- Hardware/firmware re-probe on 2026-07-09: `adb devices` returned no attached Android device, `platformio device list` returned no ESP32-S3 serial entry, and MSM261 PlatformIO builds passed for `esp32-s3-devkitm-1` and `esp32-s3-ota`. Physical Android visual proof, real FCM delivery, and real ESP32-S3 WiFi/audio/OTA validation remain blocked by missing attached devices, not by this source/build pass.
- Provider/device re-probe after portal UI deploy on 2026-07-09: backend/source smokes passed (`check`, `test`, `smoke:workspace-access`, `smoke:repositories`), provider-adjacent smokes passed (`smoke:storage`, `smoke:notification-push`, Firebase email-link generation, `smoke:api-production`, `smoke:public-deployment`, `smoke:production-roles` with explicit `PUBLIC_BACKEND_URL`, `smoke:portal-production`, live `bun run smoke:portal-browser`), Android compile/assemble/unit tests passed, and PlatformIO normal/OTA builds passed. Remaining blockers are external: no attached Android device, no ESP32-S3 serial device, no backend production `.env` with S3/Postgres/PHI/MQTT provider secrets in this shell, and no authenticated mailbox for inbox click-through.
- Emulator host-safety finding on 2026-07-09: local `Pixel_8_Pro_2` boot attempts correlated with repeated Windows `0x133 DPC_WATCHDOG_VIOLATION` bugchecks, not a Smart Health app crash. The AVD was moved to `D:\Android\avd\Pixel_8_Pro_2.avd`, AEHD was stopped/changed to demand start, and the AVD is now cold boot + SwiftShader + 2 cores. A no-accel boot did not crash the host but stayed `emulator-5554 offline`. Windows `HypervisorPlatform` is enabled with `hypervisorlaunchtype Auto`, but `HypervisorPresent=False` until a controlled restart loads WHPX. Future Android runtime proof should use WHPX after restart or a real device, not AEHD/hardware-auto boot.

## Current Severity Checklist

### Blocker

- Real physical MSM261 ESP32-S3 board validation still requires connected hardware for WiFi, heartbeat, audio, cloud command, and OTA serial evidence.
- Local production readiness strict remains blocked until backend production envs are available in the shell or can be inspected on Render: Firebase Admin/public URL/Postgres/S3/PHI/Brevo/MQTT/signing envs are not loaded locally.

### High

- Real Android FCM delivery needs a real device token against Render. Local/no-Firebase push persistence and backend retry paths are covered, but user-visible delivery on a device is not closed; this shell currently lacks usable `adb.exe`/attached Android device access.
- Production email verification should still be checked through a real inbox click-through, not only Firebase link generation or Render/Brevo provider `sent` status. Gmail was not signed in during the latest browser probe.
- Production S3/Supabase Storage provider smoke still needs the real object-storage env loaded into the process running the smoke. Local API coverage now covers signed URL/download/upload/delete/scoping behavior, and local `smoke:storage` still passes.
- Live Redis/BullMQ audio worker proof still needs `REDIS_URL` and backend + worker running against the same production data/storage env. Source persistence and duplicate-processing prevention are covered locally.

### Medium

- Account settings and notification preference behavior should keep getting expanded with browser-level mutation coverage for every dialog/form field. Backend source-level AI settings/update notification scope is covered locally; remaining work here is browser-level UX breadth, not the AI/data endpoint contract fixed on 2026-07-07.
- Patient/family/workspace profile flows now have local backend contract coverage for personal profile isolation, dependent creation, consent history create/list/revoke, account sessions, 2FA setup state, password bridge, and Android workspace switching. Remaining work is browser/emulator/device-level patient/family/workspace UX proof and live production-provider evidence, not another local backend contract pass unless new regression evidence appears.

### Polish

- Some source paths, component names, and docs still carry legacy `Clinics` wording for workspace management compatibility. Do not rename broadly unless the next slice needs it.
- Android Compose icon deprecation warnings remain non-blocking until the dependency set supports the replacement icons cleanly.

## Next Practical Slice

Recommended next non-repeated slice:

1. Before returning to ESP32, continue software/provider validation that still needs outside evidence: real Android FCM delivery, real inbox click-through for email verification, production S3/Supabase Storage provider smoke, and live Redis worker proof.
2. Continue browser/emulator-level patient/family/workspace UX proof, patient-facing consent history/session-management visual proof, Android workspace-switcher visual proof, and notification-preference breadth when provider/device gates are not available.
3. Do not repeat the closed Role/Auth/Register/Approval/RBAC, Shcare Portal settings/UI-density/workspace-summary/consent/appointments, Android family profile/password/2FA/session/workspace-switcher bridges, Supabase/Postgres repository-parity, local storage API, or live performance slices unless new regression evidence appears.

## Handoff Rule

When another slice is completed, append it here with commit/version/run ids and cleanup result, then update:

- `docs/SMART_HEALTH_PROJECT_INDEX.md`
- `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `docs/SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `docs/SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `docs/SMART_HEALTH_COMMANDS_GUIDE.md` only if commands/env/runbooks changed

## 2026-07-17 Phase 3 Identity/Profile Handoff

- Phase 3 is closed at source/build/local/simulated proof. Web, Android and the frozen backend identity/security snapshot have no known open P0/P1 after the integrated regression rerun. This is not a provider-live, emulator/device or production-release claim.
- Web proof: session revoke uses a stable retry idempotency key and requires `revokedAt`; 31/31 Auth/account tests, 14/14 contracts, TypeScript, ESLint and production build passed. No new live mutation/deploy evidence is claimed.
- Android proof: Profile/Family/Workspace/Account Security native state handling, stable idempotency and backend-confirmed outcomes; session revoke requires matching backend `revokedAt`; 108/108 unit tests across 19 suites, `assembleDebug`, and `lintDebug` passed with zero Error/Fatal. Pending-registration PII uses Android Keystore AES-256-GCM.
- Backend proof: managed-admin three-stage activation, retry/COMMIT reconciliation, last-admin protection, canonical membership/session truth, migration/import fail-closed behavior, approved doctor/share authority and notification tenant isolation are covered by the new managed-admin, identity-migration, repository and workspace negative smokes. `check`, base smoke, 15/15 2FA, 4/4 Firebase compatibility and `smoke:klt-contract` also passed on the integrated repo.
- Preservation proof: 24/24 allowlisted files match the frozen snapshot hash; originals and manifests are at `C:\Users\baobe\Documents\Codex\2026-07-13\lam\outputs\phase3-backup-20260717-043549`. No reset/stash/broad staging was used.
- Runtime/provider blockers: no attached Android target and no fresh real PostgreSQL/Firebase provider mutation proof. Keep emulator/device, TalkBack, process-death, FCM, live migration/row-lock and provider-live evidence marked `BLOCKED`. Bundled `data/db.json` requires tenant remediation before import.
- Next source slice is Phase 4 device provisioning/command/OTA compatibility. Do not reopen BLE; canonical pairing remains QR/manual claim plus secure Wi-Fi provisioning and authenticated WSS presence.
- Detailed evidence and current bug/impact records live in `docs/SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`.

## 2026-07-17 Phase 4 Device Provision/Inventory Handoff

- The Phase 4 source slice is still `IN_PROGRESS`, not a live-release claim. Backend provision QR now uses a required idempotency key and an audited atomic device/claim mutation; replay does not persist raw claim code. Admin Add Device uses the same retry contract and has pending-dismissal protection.
- Inventory fields are now contract-complete across Admin, backend JSON, SQL upsert and JSON→PostgreSQL reconciliation. Apply migration 024 before 025. Empty purchase date must remain nullable.
- Local proof: backend device-security 31/31, backend check/base/repository/workspace/identity/KLT smokes; Admin 28/28 contracts, typecheck, lint/build; firmware three PlatformIO builds and six shared fixtures. Native firmware tests, emulator/device, real Postgres/Firebase/provider, authenticated browser mutation and physical board proof are `BLOCKED`.
- Do not reopen BLE or claim setup AP/OTA completion. Open P1/P2 work is secure setup AP physical gesture/PoP/expiry/CSRF, two-phase secret rotation, SQL claim ledger hydration/update on pair/revoke, firmware telemetry ACK and durable command dedupe, plus external proof.
- When continuing, keep the progress strip updated at the phase boundary and append the next evidence rather than rewriting the historical Phase 3 entry.

## 2026-07-17 Phase 4 Secure Setup and Telemetry Handoff

- Setup recovery source slice is now present: factory-state/physical-gesture gate, ten-minute expiry, constant-time CSRF and restrictive local-portal headers. Do not mark per-device PoP/WPA2 or hardware runtime as complete.
- Device telemetry is now a versioned optional snapshot across firmware → WSS telemetry → backend allowlist/SQL migration `026_device_telemetry.sql` → Web/Admin/Android models. It includes uptime, reset reason, free heap, I2S health, packet counters, last command and OTA status; unknown fields and credential-shaped fields are discarded.
- Fresh local evidence: backend device-security `33/33`; Web lint/build; Admin contracts `28/28`, typecheck/lint/build; Android compile/unit-test build; firmware three profile builds and embedded test-target compilation. `pio test -e native` is blocked by missing `gcc/g++`; no board/provider/live-browser proof.
- Next bounded work remains two-phase credential rotation with device ACK, SQL claim hydration/update during pair/revoke and durable command dedupe. Keep the progress strip updated at each phase boundary.

## 2026-07-18 Phase 5 Scan/Audio/Review/Alert Handoff

- Phase 5 is closed only for source/build/local/simulated proof. Portal PHI caches are workspace-scoped; scan/live identity is source-bound; review and alert ledgers are real tenant/capability/audit mutations; Admin/Android AI surfaces do not fabricate clinical data or success.
- The upload contract is now fixed: required idempotency, contiguous sequence and SHA-256 content; exact replay after completion; 1 MiB/chunk, 32 MiB/scan and 32,768 chunks; a 15-minute completion lease with stale-token rejection; composite scan/workspace scope; and cleanup of unreferenced temporary PCM.
- Processing/reprocess is durable and retry-safe through generation, intent, artifact fingerprint and deterministic run/audio/AI IDs. Worker persistence is atomic; terminal failure can update only the matching generation. Reprocess requires `Idempotency-Key`; the same key replays and a new key creates a new generation.
- Fresh evidence: backend scan upload 15/15, worker 6/6, clinical workflow 8/8, device security 41/41, audio protocol 4/4, AI 5/5 plus full check/test/repository/workspace/identity/KLT/concurrency/setup gates; Web contracts 24/24 and Auth 84/84 plus lint/type/build/browser; Admin contracts 59/59 plus lint/type/client+SSR build; Android 158/158 across 26 suites plus assemble/lint/debug-instrumentation compile. APK SHA-256 is `E19F5D525AECB53295D56DCC99B62352D214A102A431AC41A5273E3BD0D4180B`.
- Live PostgreSQL/Redis, provider delivery, authenticated production mutation, Android runtime/TalkBack/FCM and physical firmware proof remain `BLOCKED`; no deployment occurred. Do not repeat the seven remediated audio P1s unless a concrete regression is reproduced.
- Next active source work is Phase 6–7: close the smallest verified gap across appointment/consent/alert/notification/staff and remaining Admin operation truthfulness while preserving Web/Android UI independence. Keep the progress strip updated at the phase boundary.

## 2026-07-18 Phase 6–7 Consent, Admin Settings And Membership Authority Handoff

- Consent/data access is closed only at source/build/local proof. Backend authority types are now explicit (`patient_consent`, `clinician_access_grant`, `administrative_assignment`) and carry purpose, canonical recipient, lifecycle, guardian scope, expiry, idempotency and audit through migration 036 and OpenAPI.
- Web Portal and Android implement the same business contract with different UI/UX. Web uses browser/desktop Portal states and exact read-after-write checks; Android uses native Compose repository/ViewModel state, adaptive layout and mobile navigation. Neither client reconstructs a missing recipient/status or displays success for an incomplete mutation response.
- Admin Settings is fail-closed: only system, branding and webhook URL values with real persistence remain mutable. Provider status is read-only; unavailable backup, API-key, device-default, notification-policy and security-policy controls are labeled unavailable rather than producing fake success.
- Membership authority was re-audited across owner, notification, account switch, patient mutation/share, appointment, scan/audio and devices. A suspended membership no longer grants any of those operational rights. Stale JSON import preserves canonical suspension; JSON and SQL device ownership both require an active membership except for an active Platform Admin.
- Fresh gates: backend check/base/repository/identity/workspace/device-ownership/KLT pass; Web 32/32 contracts plus type/lint/build; Admin 73/73 contracts plus type/lint/build; Android 174/174 plus compile/lint/assemble. Android APK SHA-256: `240D7AB72415BDCDA7C1CB33636A711B79E3BC0B0FA465989FBD6AA670952E6F`.
- No deploy occurred. Live PostgreSQL migration/row locks, authenticated Portal/Admin browser mutation, provider delivery, Android emulator/TalkBack/FCM and physical hardware remain `BLOCKED`. Firmware is `N/A` for this consent/settings slice.
- Next bounded source slice is the smallest truthful remaining Platform Admin operation (Devices, Packages or Storage) selected from current backend evidence; keep the visible progress strip updated and do not reopen completed Web/Android UI foundations without a reproduced regression.

## 2026-07-19 Phase 6–7 Packages And Storage Handoff

- Packages and Storage are closed only for source/build/local/simulated proof. Package migration 037 and storage migration 038 are additive; JSON/PostgreSQL repositories use transactional audit plus stable idempotency and exact replay.
- Admin mutations fail closed on malformed outcomes. Storage no longer claims quota, public access, AES-256 or fabricated history, retries only failed files and exposes bucket lifecycle only to Platform Admin. Settings branding upload uses the same private canonical file contract.
- Signed sharing requires the real S3 provider and an HTTPS 900-second URL. Local storage now returns `STORAGE_SHARE_PROVIDER_UNAVAILABLE`; do not restore the old local endpoint-as-share behavior.
- Fresh gates: backend package 3/3, storage 6/6, check/base/repository/identity/workspace/KLT; Admin 91/91 plus type/lint/build; OpenAPI 0.3.0 parsed; scoped diff check passed.
- Live PostgreSQL migrations, S3 signed URL, authenticated browser mutation and deploy remain `BLOCKED`. Android/firmware are `N/A` for these platform-only operations. Continue by auditing the smallest remaining Admin operation; keep the progress strip updated.

## 2026-07-19 Phase 6–7 Staff Invitation Handoff

- Staff invitation is closed only for source/build/local proof. Migration 039, JSON/PostgreSQL repositories and OpenAPI cover list/create/resend/revoke/accept with six workspace roles, stable idempotency, tenant/RBAC negatives and transaction-bound audit.
- Never persist or log raw invitation tokens. Only the SHA-256 hash is stored; replay omits token/URL. The canonical link is the Web Auth route `/staff-invitations/accept`, and delivery must remain `ready|unavailable|sent|failed` rather than a generic success toast.
- Admin Doctors, Portal Staff and Web Auth have different UI/UX but share the backend lifecycle. Auth uses identity-only login/2FA/signup/email verification and grants Portal only after exact accepted invitation + active membership + refreshed authority.
- Fresh local gates: backend staff 7/7 plus check/base/workspace/repository/identity/KLT/OpenAPI; Admin 12/12 focused and 103/103 full plus type/lint/build; Web 43/43 contracts and 91/91 Auth plus type/lint/build; Auth browser matrix 9/9 with zero serious/critical axe/runtime/layout findings.
- Live migration 039, email provider/inbox, authenticated production mutation and deploy remain `BLOCKED`; bundled JSON tenant remediation is still required. Android keeps its separate native UI and only consumes membership/workspace state; firmware is `N/A`. Continue Clinics/Workspace lifecycle P0/P1 next and keep the progress strip visible.

## 2026-07-23 Phase 6–7 Clinics/Workspace And Theme QA Handoff

- Clinics/Workspace lifecycle is closed only at source/build/local proof. Migration 040, JSON/PostgreSQL repositories and OpenAPI now share create/edit/transition/archive, optimistic version, tombstone, stable idempotency and transaction-bound audit behavior.
- Owner approval uses the canonical lifecycle repository. Owner transfer requires `expectedVersion`, increments once and replays the same operation ID. Workspace-request creation persists pending workspace, owner intent and audit/idempotency state as one operation.
- The restart regression proves an archived `org_default_clinic` remains excluded from catalog and role requests after a backend restart against the same JSON database; legacy hydration cannot resurrect an explicit tombstone.
- Admin Clinics has independent dense-management UI with exact receipt validation and full loading/stale/offline/empty/permission/retry/destructive states. Admin also has an independent light/dark/system theme adapter over shared brand semantics, while Web separately fixed system-preference pre-paint persistence. Do not copy the Web layout or components into Admin or Android.
- Fresh gates: backend lifecycle 7/7 plus check/base/workspace/repository/identity/KLT and OpenAPI 53 paths/38 schemas; Admin 122/122 plus type/lint/client+SSR/Firebase build and browser 27/27; Web 44/44 contracts, 94/94 Auth, type/lint/client+SSR/Firebase build and Auth browser 135/135.
- No live migration 040, provider/browser preview mutation cleanup or deploy occurred. Bundled JSON tenant remediation and external provider/live proof remain `BLOCKED`; Android only consumes membership/workspace status in native UX and firmware is `N/A`. Continue with Phase 6–7C by selecting the next smallest real operation or fake-state gap from the ledger.

## 2026-07-23 Phase 6–7C Notification Campaign Handoff

- Notifications is closed only at source/build/local proof. Migration 041 plus JSON/PostgreSQL repositories provide recipient-scoped workspace/role/user campaigns, required idempotency, transaction-bound audit and separate in-app/email/push delivery states.
- Admin has an independent campaign-management UI with real audience/provider options, strict receipt validation and accessible responsive states. Web and Android only consume the shared delivery contract; Android retains native notification UI and does not receive a copied Admin composer. Firmware is `N/A`.
- Fresh gates: backend campaign `5/5` plus check/base/push/workspace/repository/identity/KLT; Admin `128/128`, type/lint/build/Firebase build and browser `36/36` with a real temporary campaign/cleanup; Web `94/94` Auth and `44/44` contracts plus lint/builds; Android `176/176` plus compile/assemble.
- Live migration 041, Brevo/FCM delivery, Android runtime/deep-link/channel proof, preview/live mutation cleanup and deploy remain `BLOCKED`. Continue Phase 6–7D with the next concrete ledger gap; do not reopen Notifications without regression evidence and keep the progress strip updated.

## 2026-07-23 Phase 6–7D1 Overview Truthfulness Handoff

- Platform Admin/Portal Overview is closed at source/build/local proof. Its `today|7d|30d` API uses real timestamp buckets and timezone metadata; bucket totals must match range-scoped scan totals, stable lifecycle keys are required and invalid ranges fail closed.
- Admin removed fake fallback zeros, percentage-distributed chart data, hardcoded trends, fake progress and the synthetic alert timeline. First-load errors render error/retry only; confirmed prior data is retained solely as an explicitly stale refresh state. UI remains independently optimized for Admin/Portal and is not copied into Android.
- Fresh gates: backend overview `4/4` plus check/base/workspace/repository; OpenAPI 56 paths/53 schemas; Admin `135/135`, type/lint/client+SSR/Firebase builds and browser `45/45` across 390/768/1440 plus light/dark/system with zero blocking axe/runtime/request/layout/target findings.
- No live deployment occurred. Android is `N/A` because native patient/doctor dashboards have different actors and information architecture; firmware is `N/A`. Continue Phase 6–7D2 with the next concrete `DATA-FAKE-011` gap and keep the progress strip current.

## 2026-07-23 Phase 6–7D2A Storage State Handoff

- Storage D2A is closed only at source/build/local proof. The first-load guard was already preventing the dormant default object from showing on an ordinary total failure; the real fixed defect was coupled `Promise.all` behavior that discarded partial success and destroyed confirmed data after a failed refresh.
- Stats and files now settle and retry independently, pass strict parsers, retain only explicitly stale confirmed data, and never replace an unavailable section with zero facts. Upload is unavailable until the backend bucket catalog is confirmed; Devices reuses the strict file parser for firmware inventory.
- Fresh gates: Storage `13/13`, full Admin `138/138`, TypeScript, ESLint, client/SSR and Firebase Admin builds, plus browser `54/54` at 390/768/1440 and light/dark/system with zero blocking axe/runtime/request/overflow/theme/target findings.
- No backend schema, Android UI or firmware protocol changed. Live S3/provider, authenticated preview/live mutation and deploy proof remain `BLOCKED`. Continue D2 with the next concrete ledger gap and keep the progress strip current.

## 2026-07-23 Phase 6–7D2B Patient CRUD Handoff

- D2B is closed at source/build/local/browser proof. Canonical `patientId` is never interchangeable with `patientCode`; structured create/edit/delete has strict parsing, exact receipts, stable retry keys, tenant/capability enforcement, audit and JSON rollback/concurrency protection.
- Admin and Portal remain visually and interactionally independent. Admin browser passed `63` checks plus real CRUD; Portal Patients passed `9` responsive/theme checks plus create/update/delete replay and cleanup. Shared Portal shell target-size and ARIA regressions found by the new smoke were fixed.
- Fresh gates: backend check/base/repositories/workspace/KLT; Admin `146/146` plus type/lint/builds; Web `53/53`, Auth/UI `96/96` plus type/lint/builds; Android family-profile tests plus debug unit/build. No live deploy, emulator/device or hardware proof is claimed.
- Continue D2C at Patient Import. Do not describe the existing sequential client row creation as batch import; completion requires backend `validate → preview → commit`, 24-hour expiry, duplicate reporting, all-or-nothing transaction, idempotency and cleanup proof. Keep the progress strip current.

## 2026-07-23 Phase 6–7D2C Patient CSV Import Handoff

- D2C is closed at source/build/local/browser proof. The legacy sequential client create path is gone; backend validation and an expiring persisted batch now own CSV parsing, structured errors, duplicate detection and exact idempotency, while commit creates all patients and the audit receipt atomically or creates none.
- Migration 042, OpenAPI `59/59`, JSON→PostgreSQL reconciliation, import tests `8/8`, integrated backend gates, Web `57/57` contracts, `97/97` Auth/UI, both builds and the `18/18` Portal Patients/Import browser matrix are green. The browser journey performs real validate/commit/replay and cleanup.
- No live deploy or PostgreSQL transaction proof is claimed. Apply backend/migration before Portal and repeat controlled import/cleanup on preview/live. Android and firmware are `N/A` because bulk workspace import is desktop-only; retain native mobile family-profile CRUD rather than copying the Portal screen.
- Continue Phase 6–7D2 from the next reproduced Admin/Portal truthfulness gap and keep the progress strip current.

## 2026-07-23 Phase 6–7D2D Audit/Export Handoff

- D2D is closed at backend/source-local proof. The canonical ledger is `/api/v1/audit-logs`; `/api/v1/access-logs` and `/api/v1/portal/audit-log` are compatibility aliases with the same server-side filter, sort and pagination semantics. Audit metadata is secret-redacted before persistence, and JSON fallback remains append-only like the protected PostgreSQL ledger.
- Migration 043 and `shcare.export-artifact.v1` create immutable backend JSON, UTF-8 CSV, OpenXML XLSX and PDF artifacts with persisted dataset/scope/filter metadata and SHA-256. Do not reintroduce client-only CSV, a CSV label over JSON, or a success toast before the backend artifact downloads.
- Authority is explicit: Platform Admin may export the platform-global audit ledger; workspace owner/admin is current-workspace scoped; doctor clinical output is active-grant scoped; patient output is own/dependent scoped; billing/viewer are denied. Job listing/downloading remains tenant and creator/manager scoped.
- Create is idempotent and transaction-audited, replay does not append another create audit event, download is separately audited, and temporary doctor access used by the regression is revoked during cleanup.
- Backend proof passed `check:audit-export`, audit/export `12/12`, repositories, identity migrations, workspace access, base test, KLT contract and OpenAPI `0.4.0`. Bundled JSON tenant/dangling-owner remediation is explicitly audited and the identity gate passes; older blocker notes are historical, not current.
- Platform Admin proof passed TypeScript, ESLint, `151/151` contracts, build and browser `72/72` across 390/768/1440 and light/dark/system. The browser verified real audit filter/metadata behavior plus a platform CSV Blob with SHA-256, `Content-Disposition`, UTF-8 BOM and cleanup, with zero blocking axe/runtime/request/layout/theme/target issue. `xlsx` advisories are removed; 17 other dependency advisories remain, none critical.
- Portal proof passed focused `8/8`, full Vitest `29` files/`105` tests, contracts `60/60`, TypeScript, ESLint, diff check and Firebase build. Targeted browser proof filtered 147 audit rows to 11 server-side matches, downloaded 11 CSV rows with SHA prefix `4e031d2e6faa`, observed the create/download ledger pair, rendered real Reports totals and cleaned backend/ports/temp data/credentials. Platform scope and workspace/hash/renderer drift fail closed.
- The full Portal route smoke is still an explicit proof gap: legacy selectors were repaired, but the latest rerun ended on dev-server timeout/`ERR_CONNECTION_REFUSED` before a product assertion. Do not call that matrix passed or a product failure. Portal `bun audit` retains 5 advisories (1 high, 3 moderate, 1 low).
- No live PostgreSQL migration 043, provider/live query, authenticated preview/live artifact journey or deploy was performed. Android workspace/platform audit UI is `N/A`; personal export/access-history is a separate native Settings/Security slice. Firmware is `N/A`.
- Continue from the next reproduced Admin/Portal truthfulness gap and keep the visible progress strip current; reopen D2D only for regression or release evidence.

## 2026-07-23 Phase 8B/8C handoff

- The former full Portal route-smoke gap is closed locally. The isolated run
  returns `ok: true` after fixing demo membership truth, RBAC navigation/query
  parity, consent harness drift, explicit unavailable 2FA and appointment/staff
  permission separation.
- Final Portal gates are `105/105` Auth/UI, `63/63` contracts, type/lint/build;
  backend check/base smoke also pass.
- Portal dependency remediation is current: Vite `7.3.6` and compatible
  transitive overrides leave `bun audit` with no findings, followed by a green
  test/type/lint/build and local browser rerun. Admin production-only audit has
  one low Windows development-server advisory and no high/critical finding.
- Fresh candidate builds pass for Admin, Android (`176/176`), brand/contracts
  and all three firmware profiles. Version/hash/compatibility facts are in
  `SMART_HEALTH_RELEASE_CANDIDATE_MANIFEST.md`.
- Continue with an intentional candidate index and clean release worktree.
  Exclude unrelated CV, office/report evidence, debug images, local config,
  credentials and generated runtime/build directories.
- Provider/live database, Android production signing/runtime and hardware proof
  remain `BLOCKED`; do not promote or report them complete without evidence.
