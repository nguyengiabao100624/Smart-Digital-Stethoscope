# Smart Health - Project Index

Last updated: 2026-07-23

This is the fastest navigation file for `D:\Study\KLTN`. Read it before opening broad folders or scanning the whole workspace.

## Start Here

Read in this order:

1. `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md` - current state, product direction, latest verified work.
2. `docs/SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` - accepted rebuild plan execution order, bug ledger, cross-surface impact records, proof classes and current phase evidence.
3. `docs/SMART_HEALTH_KLTN_REPORT_COMPLETION_PLAN.md` - KLTN/report gate, required evidence, what to finish before more product development.
4. `docs/khoaluan/README.md` - KLTN contract pack: unified system contract, audio packet/WebSocket contract, demo evidence checklist, and gap/test matrix.
5. `docs/SMART_HEALTH_PROMPT_REQUIREMENTS_HANDOFF.md` - broad prompt ledger, product invariants, closed slices, blockers, and next non-repeated slice.
6. `docs/SMART_HEALTH_IMPLEMENTATION_STATUS.md` - what is real, partial, scaffold, or still missing.
7. `docs/SMART_HEALTH_PRODUCTION_BACKLOG.md` - next production slices in priority order.
8. `docs/SMART_HEALTH_COMMANDS_GUIDE.md` - commands, envs, smoke tests, deploy notes.
9. `docs/SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` - Vietnamese operational setup checklist.

For product decisions, also read:

- `docs/SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`
- `docs/SMART_HEALTH_THIRD_PARTY_SETUP.md`
- `docs/SMART_HEALTH_AGENT_SKILLS_GUIDE.md`
- `docs/SMART_HEALTH_RULES_AND_SKILLS_AUDIT_2026-07-10.md`

## Whole-System Scope Contract

Smart Health means the full `D:\Study\KLTN` product system, not only one app or folder. Treat `smart-health-embedded`, `smart-health-android`, `smart-health-admin`, `smart-health-web`, Firebase, Render, Supabase/Postgres, object storage, firmware, smoke tooling, CI/deploy scripts, and the handoff docs as one connected product.

For any feature or fix, trace the user-facing workflow end to end before calling it done: backend API and repository policy, auth/role/tenant logic, web portal behavior, admin behavior, Android behavior when relevant, firmware/device behavior when relevant, live/provider data, tests/smokes, deploy impact, and docs/handoff. Do not complete isolated UI or backend changes when the adjacent client, permission model, smoke coverage, or production runbook also needs to change.

## KLTN Contract Pack

For thesis-focused work, use `docs/khoaluan` as the contract source before adding more production-development scope:

- `docs/khoaluan/01-system-contract.md` maps actors, roles, entities, states, data ownership, and implemented/partial/future claim levels.
- `docs/khoaluan/02-audio-packet-and-realtime-contract.md` locks the current PCM16 16 kHz mono audio packet, firmware WSS/UDP behavior, backend `/app`/`/esp` realtime events, Android live-audio expectations, and simulated-evidence rule.
- `docs/khoaluan/03-demo-and-evidence-checklist.md` lists the repeatable demo/evidence commands and required artifacts.
- `docs/khoaluan/04-test-matrix-and-gap-log.md` records the KLTN module matrix, gaps, blockers, and minimum demo definition of done.

Backend `smart-health-embedded/web-monitor` now has `npm.cmd run smoke:klt-contract` to check that those docs exist and the firmware/backend/Android source still matches the documented KLTN audio contract.

## Active Source Map

| Area | Path | Notes |
| --- | --- | --- |
| Backend API / monitor | `smart-health-embedded/web-monitor` | Node.js backend, repository layer, migrations, smoke scripts, WebSocket/audio/device APIs. |
| Production firmware | `smart-health-embedded/MSM261S4030H0` | Only active ESP32-S3 firmware target. INMP441 is retired. |
| Android app | `smart-health-android` | Kotlin/Jetpack Compose app, Firebase-backed role/session flows, FCM token registration. |
| Shcare portal | `smart-health-web` | Public site plus doctor/clinic Workspace Portal at `https://shcare.web.app`. |
| Platform admin | `smart-health-admin` | Platform Admin Console at `https://shcare-admin.web.app`; UI source is in the Vietnamese-named design folder. |
| Firebase local credentials | `firebase` | Local secret/service-account folder. Keep out of Git. |
| Thesis/report docs | `docs`, root report folders/files | Human/report artifacts. Do not delete without explicit confirmation. |

## Live Surfaces

| Surface | URL |
| --- | --- |
| Shcare Workspace Portal | `https://shcare.web.app` |
| Platform Admin Console | `https://shcare-admin.web.app` |
| Backend API | `https://smart-health-api-r5is.onrender.com/api` |
| Firebase project | `smart-health-stethoscope` |

## Current Latest State

- The accepted whole-system rebuild has closed Phase 5 and the Phase 6–7 consent/settings, package/storage, staff, Clinics/Workspace, Notifications, Overview D1, Storage D2A, Patient CRUD D2B, Patient Import D2C and Audit/Export D2D slices at source/build/local/targeted-browser level. The bundled JSON tenant mismatch and dangling patient-owner reference are now explicitly remediated and audited; the identity-migration gate passes. Audit/Export still carries an explicitly documented full Portal route-smoke harness gap, while active work continues from the next reproduced Admin/Portal truthfulness gap. Phase 4B plus live PostgreSQL/Redis/provider, Android runtime/device and physical firmware proof remain explicitly `BLOCKED`; no deployment is implied. Use `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` for exact evidence and blockers.
- Firebase Auth is the identity provider across Android, Web Admin, and Shcare Portal.
- Current Render backend is `https://smart-health-api-r5is.onrender.com` (`/api` base `https://smart-health-api-r5is.onrender.com/api`). The previous `smart-health-api-xj0a` workspace hit the free outbound bandwidth limit and is no longer the active production URL.
- Render, Firebase Hosting/Auth, Supabase Postgres, and Supabase S3-compatible storage were already set up earlier; do not ask to recreate Firebase/Supabase from scratch. Render was recreated in the new workspace on 2026-07-09 because Render does not support direct service transfer between workspaces.
- Supabase connector access is available for production-like DB inspection. On 2026-07-07 it confirmed project `smart-health-production` (`mahvymyncxszvuhlycwp`), applied migrations `001`-`008`, RLS-enabled public tables, no direct `anon`/`authenticated` grants, and no permissive public policies.
- `MSM261S4030H0` is the only active firmware target. Do not route new work to INMP441.
- Shcare Web registration email verification now uses a backend-generated Firebase verification link delivered through the outbound email provider stack.
- Backend notification creation now has a Firebase Cloud Messaging delivery path for direct user notifications, records push delivery status separately from platform-admin email fanout, persists per-attempt `pushAttempts` history without raw FCM tokens, and retries retryable provider failures with bounded env controls.
- Phase 6–7C adds recipient-scoped notification campaigns with workspace/role/user audiences, required idempotency, transaction audit, separate in-app/email/push outcomes and provider availability. Admin owns the campaign UI; Web/Android consume delivery state through separate platform UX. Live migration 041 and provider/device delivery remain `BLOCKED`.
- As of 2026-07-07, backend/source commit `88877ad5` (`Ship Smart Health tenant hardening and live smokes`) and docs commit `b12a16f6` (`Document Smart Health live deploy verification`) are pushed to `origin/main`. Render auto-deploy was verified through live health and public/role/portal/admin smokes.
- As of 2026-07-09, `shcare.web.app` is deployed at Firebase Hosting version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`, release `projects/162993928259/sites/shcare/channels/live/releases/1783550011942000`, built against `https://smart-health-api-r5is.onrender.com/api`. `shcare-admin.web.app` is deployed at version `projects/162993928259/sites/shcare-admin/versions/0d796ccc2368d21e`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783598280968000`, built against the same backend.
- The 2026-07-09 Render/Firebase migration verification passed: backend `/api/health` and `/api/v1/health` returned 200, `/api/me` returned expected 401 unauthenticated, backend `check`, public deployment smoke, production-role smoke, portal production smoke, Shcare portal browser smoke, portal mutation smoke run `portal-mutation-mrce7zqs`, and admin mutation smoke run `admin-mutation-mrcebq30`.
- Shcare Portal unauthenticated deep links such as `/portal/patients` now redirect to `/login` without the previous `No QueryClient set` crash or React maximum-update-depth console failure.
- Shcare Portal login no longer exposes raw Firebase `auth/invalid-credential` errors. Invalid credentials render safe Vietnamese guidance and platform-admin accounts are directed to `shcare-admin.web.app`.
- Live authenticated portal API smoke is available through `npm.cmd run smoke:portal-production` after `npm.cmd run smoke:production-roles`; it verifies platform portal rejection plus workspace-admin and doctor read paths against Render.
- Authenticated Chrome smoke on the deployed `shcare.web.app` confirmed workspace-admin and doctor read routes without runtime console warnings; portal form controls now have stable `id`/`name` attributes.
- Live `bun run smoke:portal-browser` and `bun run smoke:portal-mutation` pass against `https://shcare.web.app`. Mutation coverage creates/updates/deletes a controlled patient, provisions/claims/assigns/restores/cleans a device, creates/reads/deletes a notification, saves/restores workspace settings and notification preferences, exports CSV, submits/cleans a support ticket, checks expected 404 states, logs out, and logs back in. A custom no-query-leak smoke also confirms pre-hydration/native form submit does not expose credentials in URL query strings.
- Live `npm.cmd run smoke:admin-mutation` passes from `smart-health-admin\thiết kế giao diện` after refreshing production role credentials. It covers controlled Web Admin workspace/package/patient/device/notification/storage/settings mutations against live Render/Admin and cleans up every created/restored resource.
- Web Admin lint is warning-free after the Fast Refresh mixed-export cleanup; PDF export font bloat was moved out of TypeScript bundles into `public/fonts/roboto-regular.ttf`.
- Follow-up on 2026-07-09 filled the Shcare Portal `/portal/settings` gap and is now live on `shcare.web.app`: the route includes profile, avatar, password, 2FA, sessions, notification preferences, and workspace settings backed by `/me/*` and `/auth/sessions`. Verification passed locally with `bunx tsc --noEmit`, `bun run lint`, `bun run build`, `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-browser`, and local mutation run `portal-mutation-mrclhqx7`; then `bun run build:firebase`, Firebase Hosting deploy target `webapp`, live `bun run smoke:portal-browser`, and live `bun run smoke:portal-mutation` run `portal-mutation-mrclugrb` passed without the local CORS bypass flag.
- Follow-up on 2026-07-09 fixed and deployed the Shcare Portal density/search-field regression from the user screenshot: commit `ff9adec5` normalizes portal title/text/input/button/table sizing and applies a shared `.portal-search-field` to Patients, Records, Audit Log, and Help so search icons no longer overlap placeholders. Firebase Hosting `shcare` version `projects/162993928259/sites/shcare/versions/a1b568cf873aac0d` / release `projects/162993928259/sites/shcare/channels/live/releases/1783594254847000` is live. Verification passed with Shcare Web typecheck/lint/Firebase build, local and live `bun run smoke:portal-browser`, `npm.cmd run smoke:public-deployment`, and Playwright visual QA measuring `21.44px` portal titles, `44px` search inputs, about `12.809px` icon-to-text gap, and zero checked overflow.
- Same-turn follow-up density sweep checked 19 live portal routes for overflow, H1 scale, portal input/search/button dimensions, search icon gap, logo image loading, and severe console/page errors; it passed with `failing=[]` and `severe=[]`.
- Same-turn provider/device re-probe passed backend/source smokes, local storage/notification/API smokes, Firebase email-link generation, live public/role/portal/browser smokes, Android compile/debug assemble/unit tests, and PlatformIO normal/OTA firmware builds. Remaining blockers are external access: no attached Android device from `adb devices`, no ESP32-S3 serial device from `platformio device list`, no backend production `.env` with S3/Postgres/PHI provider secrets in this shell, no authenticated mailbox for inbox click-through, and `MQTT_URL` unset.
- 2026-07-10 KLTN gate follow-up added `docs/khoaluan` as the unified thesis contract pack and backend `npm.cmd run smoke:klt-contract` as a source-contract smoke. This closes the missing thesis-contract documentation gap, but it does not replace physical ESP32-S3/MSM261S4030H0 proof or Android device/emulator runtime proof.
- Web Admin production env guard now rejects the retired `smart-health-api-xj0a` Render URL and requires `VITE_SMART_HEALTH_API_BASE_URL` to match `VITE_SMART_HEALTH_BASE_URL + /api`. The local `.env.production` was corrected to `https://smart-health-api-r5is.onrender.com`, Web Admin lint/build/deploy passed, and live `npm.cmd run smoke:admin-mutation` passed with run id `admin-mutation-mrdgdbok` against `https://smart-health-api-r5is.onrender.com/api`.
- Emulator safety: do not auto-boot `Pixel_8_Pro_2` with AEHD/hardware acceleration. Boot attempts produced Windows `0x133 DPC_WATCHDOG_VIOLATION` bugchecks. The AVD now lives at `D:\Android\avd\Pixel_8_Pro_2.avd`, AEHD is stopped/demand-start, the AVD is set to cold boot with SwiftShader and 2 CPU cores, and Windows `HypervisorPlatform` has been enabled with `hypervisorlaunchtype Auto`. Current boot still reports `HypervisorPresent=False`, so a controlled restart is required before retrying WHPX-accelerated emulator QA. A no-accel boot did not crash the host but stayed `emulator-5554 offline`, so it is not a usable Android QA path.
- Follow-up on 2026-07-09 closed and deployed the Shcare Portal workspace summary contract: commit `2b3d21a3` is pushed to `origin/main`, `/portal/workspace` no longer uses hardcoded zero counters, backend `/me` returns operational summaries for current workspace and memberships, and Firebase Hosting `shcare` version `projects/162993928259/sites/shcare/versions/4f370368cfbe2403` / release `projects/162993928259/sites/shcare/channels/live/releases/1783592537850000` is live. Verification passed with backend `check`, `smoke:workspace-access`, Shcare Web typecheck/lint/Firebase build, `smoke:public-deployment`, live `smoke:portal-production`, live `bun run smoke:portal-browser` without the local CORS bypass, and live mutation run `portal-mutation-mrdczthd` with cleanup.
- Follow-up on 2026-07-09 filled the Shcare Portal `/portal/consent` workflow gap and is now live on `shcare.web.app`: workspace users can select patient, doctor/workspace target, full-profile or selected-scan scope, optional expiry, list active shares, and revoke shares. Verification passed with typecheck/lint/build/Firebase build, local preview browser/mutation smokes, Firebase deploy version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`, live browser smoke, and live mutation run `portal-mutation-mrcnnzcg` creating/revoking share `share_20260708223625_e69f019e`.
- Follow-up on 2026-07-09 moved patient-share grants toward repository-backed persistence: backend source now has `repositories.patientShares` for SQL-backed list/find/save/revoke, portal share routes use it when available, `migrateJsonToPostgres.js` carries existing runtime shares, and `db/migrations/009_doctor_patient_access_runtime_parity.sql` adds `doctor_id`, `scope`, `scan_ids`, revoke metadata, nullable doctor user, and share indexes. Supabase production schema `mahvymyncxszvuhlycwp` has app migration `009_doctor_patient_access_runtime_parity` applied and verified. Local verification passed with backend syntax checks, `smoke:repositories`, `check`, `test`, and `smoke:workspace-access`; live API create-list-revoke consistency is verified, while row-level proof for newly-created live Supabase share rows still needs DB/log access.
- Follow-up on 2026-07-09 closed the Android/patient family consent-history backend contract locally and pushed commit `fde6ae4c`: `GET /api/v1/patients/:id/shares` returns revoked grants for history, and `smoke:workspace-access` now logs in a personal patient account to verify self/dependent profile isolation, dependent creation, doctor share-target lookup, consent create/list/revoke, revoked-history visibility, and denial of workspace-owned patient profiles. Android source/build verification also passed for `DataAccessScreen.kt`; live public deployment smoke passed, and authenticated portal production smoke passed on rerun after one transient Render 502.
- Follow-up on 2026-07-09 closed the Android account password backend bridge locally: `ChangePasswordScreen.kt` now updates Firebase, refreshes the backend API token, and records the change through `/api/v1/me/password` with `firebaseClientUpdated=true`; demo/backend sessions still use current/new password directly. `smoke:workspace-access` verifies backend password change, old-password rejection, and new-password login for the seeded patient account.
- Follow-up on 2026-07-09 closed Android Privacy 2FA setup-state parity locally: `PrivacyScreen.kt` now loads/updates backend `/api/v1/me/2fa`, `AuthUser` parses backend 2FA fields, recovery codes are shown after enable, biometric is clearly unavailable until native BiometricPrompt exists, and `smoke:workspace-access` verifies patient 2FA enable/disable with recovery-code response.
- Follow-up on 2026-07-09 closed Android Privacy auth-session parity locally: `PrivacyScreen.kt` now lists backend `/api/v1/auth/sessions`, marks the current session, and revokes non-current sessions. Backend demo auth fallback now rejects invalid/revoked bearer tokens instead of falling back to the platform admin demo user, and `smoke:workspace-access` verifies patient session list/revoke plus revoked-token denial.
- Follow-up on 2026-07-09 closed Android family profile management locally: Settings now includes `Hồ sơ gia đình`, `FamilyProfilesScreen.kt` lists/creates/updates/deletes dependent profiles through backend patient APIs, and `smoke:workspace-access` verifies patient profile create/update/delete plus cross-workspace update denial.
- Follow-up on 2026-07-09 closed Android workspace switcher parity locally: Android now parses backend `currentWorkspace`, `currentMembership`, and `memberships`; Settings exposes a Workspace route; doctor/patient dashboards show current workspace context; and backend smoke verifies a joined doctor can switch workspace through `/api/v1/me` and switch back. Verification passed with backend `node scripts\workspaceAccessSmokeTest.js`, Android `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, and `.\gradlew.bat :app:testDebugUnitTest`. Real emulator/device visual proof is still pending.
- Global/project rules now require a Smart Health skill bundle for broad work: `smart-health-project` plus context-budget/strategic-compact, then every materially useful UI/UX, implementation, QA, security/auth/data, deploy, and handoff skill for the touched surfaces. Do not collapse future "complete everything" requests to one route or one skill.
- Local strict production readiness can still report `BLOCKED` when Render/Supabase/Firebase/provider secrets are not loaded into the current PowerShell process.
- Backend repository hydration now treats normalized SQL rows as authoritative even when SQL tables are empty, preventing stale runtime snapshot rows in Postgres-backed mode. `smoke:repositories` covers this plus optional FK guard SQL for user/patient/device links.
- Commit `6d902355` deployed the repository hydration hardening. Live public deployment smoke and authenticated portal production smoke passed, and Supabase confirmed runtime/normalized counts are synced again (`organizations=10`, `users=12`).
- Backend workspace smoke now covers storage share URL, authenticated local-object reads, direct download content, cross-workspace signed URL/download denials, upload/list/download/delete, and post-delete 404.
- Shcare Web has `bun run smoke:performance` for live public/portal performance regression. It passed on `https://shcare.web.app`; public home transferred about 4.45 MB and loaded in about 0.8-5.1s across reruns, while authenticated portal routes loaded in about 0.4-1.3s after login.
- Commit `edd419ef` pushed the storage/performance smoke follow-up. Post-push live public deployment smoke and authenticated portal production smoke passed.
- Commit `27f309be` fixed a Web Admin live mutation regression where a background `/devices` list could drop a just-provisioned runtime device before PATCH when normalized SQL did not yet include it. Post-deploy live `npm.cmd run smoke:admin-mutation` passed with run id `admin-mutation-mran2ji6` and HTTP 200 cleanup for settings, notification, storage bucket, device, patient, package, and workspace.
- 2026-07-10 source follow-up closed the backend audio worker persistence gap: `scripts/worker.js` now persists BullMQ audio job output through `src/audioProcessingWorker.js` into scan/audio/AI repositories instead of only logging results, and scan complete/reprocess avoids duplicate inline + queued processing when Redis enqueue succeeds. Verification passed with backend `npm.cmd test`, `npm.cmd run check`, `npm.cmd run smoke:workspace-access`, and `node scripts\worker.js` without `REDIS_URL` returning the expected disabled message. Live Redis/BullMQ runtime proof still needs queue envs.
- 2026-07-10 follow-up closed and deployed the missing Shcare Portal appointments/consultations module before ESP32 work: commit `b9a6d4cb` is pushed to `origin/main`, Supabase production migration `20260710054623 appointments` is applied and verified for table/columns/indexes/constraints, Firebase Hosting `shcare` version `projects/162993928259/sites/shcare/versions/044ec7e04023ffb8` / release `projects/162993928259/sites/shcare/channels/live/releases/1783662693801000` is live, and live smokes passed. Evidence includes backend public/production-role/portal-production smokes, live portal browser smoke seeing `/api/portal/appointments` HTTP 200, and live mutation run `portal-mutation-mreisktg` creating appointment `appt_20260710055434_71922d95`, confirming it, deleting it, and cleaning up.
- Firebase Admin smoke can run locally by setting `FIREBASE_PROJECT_ID=smart-health-stethoscope` and `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file under `D:\Study\KLTN\firebase`; `smoke:production-roles`, `smoke:portal-production`, `smoke:firebase-email`, and `smoke:public-deployment` passed on 2026-07-07.
- Later 2026-07-07 full rerun passed backend `check`, `test`, `smoke:storage`, `smoke:notification-push`, `smoke:api-production`, `smoke:workspace-access`, `smoke:repositories`, Shcare Web `smoke:portal-browser`, `smoke:portal-mutation` run `portal-mutation-mraqouwy`, `smoke:performance`, lint/typecheck/Firebase build, Web Admin `smoke:admin-mutation` run `admin-mutation-mraqkmzo`, lint/Firebase build, Android debug/release builds, and MSM261 PlatformIO normal/OTA builds. `smoke:mqtt` skipped because `MQTT_URL` is unset.
- Gmail inbox receipt/click-through, real Android FCM, and physical ESP32-S3 validation remain unclaimed: Gmail was not signed in, `adb devices` showed no attached Android device, and PlatformIO returned no ESP32-S3 serial device.

## Safe Cleanup Rules

- Do not delete, move, or overwrite report files, Word documents, screenshots, CV files, or folders that may contain user data unless explicitly confirmed.
- Ignore local tool/cache folders instead of committing them: `.config/`, `.impeccable/`, `.npm-cache/`, and `codex-telegram-bridge/`.
- Keep generated build output out of Git: `dist/`, `dist-firebase/`, `.firebase/`, `.vite/`, `.tanstack/`, `.lovable/`, PlatformIO `.pio/`, Android `build/`, Gradle caches, logs, and local secret files.
- Keep shared skills/tools global under `C:\Users\baobe\.codex\skills` or `C:\Users\baobe\.agents\skills`; do not recreate repo-local `.agents/skills`, `.ai_skills`, or `skills-lock.json`.
- Before staging/committing, use scoped status/diff commands so unrelated dirty files do not get mixed into the change.

## Common Focused Checks

Backend:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:klt-contract
npm.cmd run check
npm.cmd run check:audit-export
npm.cmd run smoke:audit-export
npm.cmd run smoke:workspace-access
npm.cmd run smoke:repositories
npm.cmd run smoke:identity-migrations
npm.cmd run smoke:public-deployment
```

Authenticated portal production API:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:production-roles
npm.cmd run smoke:portal-production
```

Notification push:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:notification-push
```

Shcare Web:

```powershell
cd D:\Study\KLTN\smart-health-web
bun run lint
bunx tsc --noEmit --pretty false
bun run test:auth
bun run test:contracts
bun run build:firebase
bun run smoke:portal-browser
bun run smoke:portal-mutation
```

Web Admin:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:production-roles

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run test:contracts
npm.cmd run lint
npm.cmd run build:firebase:admin
npm.cmd run smoke:admin-operations-browser
npm.cmd run smoke:admin-mutation
```

Android:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

Firmware:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

## Remaining Practical Work

- Do not repeat the closed Role/Auth/Register/Approval/RBAC, repository parity, local storage API, live performance, live portal mutation, or admin mutation slices unless new regression evidence appears.
- Confirm real inbox receipt/click-through for production email verification after Gmail is signed in or a mailbox/API credential is available.
- Run real Android FCM delivery with a real device token against Render after `adb.exe`/Android SDK is accessible and a device is attached.
- Run production S3/Supabase Storage provider smoke with provider envs loaded in the shell or host running the smoke.
- Flash the real MSM261 ESP32-S3 board and capture serial evidence for WiFi, heartbeat, audio, cloud command, and OTA after the ESP32-S3 appears as a real serial device.

### 2026-07-17 Phase 4 continuation checkpoint

- Source/local milestone: backend provision QR is idempotent and audit-atomic; inventory metadata is synchronized through JSON, SQL and importer; Admin Add Device uses a stable key and pending-dismissal guard.
- Verification: backend device-security 31/31 plus check/base/repository/workspace/identity/KLT smokes; Admin contracts 28/28, typecheck, lint/build; firmware three PlatformIO builds and shared fixtures.
- Still blocked/open: real PostgreSQL/provider/browser/Android/hardware proof, native firmware tests without host `gcc/g++`, secure setup AP PoP/CSRF/expiry, two-phase secret rotation, SQL claim lifecycle and complete telemetry ACK/durable dedupe.

### 2026-07-17 Phase 4 secure setup and telemetry checkpoint

- Setup AP source hardening is implemented for factory/physical gating, CSRF, security headers, expiry and factory reset. The remaining setup security gap is per-device PoP/WPA2 plus hardware confirmation.
- Telemetry now has one allowlisted contract from firmware through WSS/backend migration 026 to Web/Admin/Android models. Secret-shaped and unknown fields are rejected; freshness continues to use server-side `lastSeenAt`.
- Evidence recorded: backend 33/33 device-security smoke, Web lint/build, Admin 28/28 + typecheck/lint/build, Android compile/unit test, and firmware build/test-target compile. Native, provider, browser, Android runtime and physical device proof remain blocked.
- Next Phase 4 gate: rotation ACK/overlap, SQL claim lifecycle and durable command dedupe; telemetry UI may expose only confirmed/stale/degraded states.

### 2026-07-19 Phase 6–7 current checkpoint

- Consent/settings/membership, service packages and Platform Storage are now source/local closed; detailed proof is in `SMART_HEALTH_IMPLEMENTATION_STATUS.md` and `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`.
- Current package/storage gates: backend package 3/3, storage 6/6, check/base/repository/identity/workspace/KLT; Admin 91/91 plus TypeScript, ESLint and client/SSR build; OpenAPI 0.3.0 parsed.
- Keep live migrations 037/038, S3 signed sharing, authenticated browser mutation and deploy marked `BLOCKED`. Android and firmware are `N/A` for these Platform Admin-only operations.
- Continue with the smallest remaining Admin operation audit; do not repeat closed Phase 4/5 or UI-foundation work without a reproduced regression.

### 2026-07-19 Phase 6–7 staff invitation checkpoint

- Staff invitation is source/local closed through migration 039, JSON/PostgreSQL repositories, OpenAPI and Admin/Portal/Auth clients. The lifecycle is list/create/resend/revoke/accept with six workspace roles, required idempotency, tenant/RBAC, transaction audit, token-hash-only persistence and truthful provider delivery state.
- Web Auth owns `/staff-invitations/accept`; identity-only login/2FA/signup/email verification does not grant Portal access until exact acceptance and active membership survive an authority refresh. Admin Doctors and Portal Staff retain independent UI/UX.
- Evidence is recorded in `SMART_HEALTH_IMPLEMENTATION_STATUS.md`, `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` and `docs/khoaluan/04-test-matrix-and-gap-log.md`. Live migration/provider/inbox/authenticated production mutation/deploy remain `BLOCKED`.
- Clinics/Workspace lifecycle P0/P1 is source/local closed. Active work moves to Phase 6–7C: the next smallest remaining real operation or fake-state gap, while live migration/provider/deploy proof stays separate.

### 2026-07-23 Phase 6–7 Clinics/Workspace checkpoint

- Migration 040, JSON/PostgreSQL repositories and OpenAPI now share a versioned, idempotent and audited create/edit/transition/archive lifecycle. Owner approval/transfer uses the same canonical state machine and explicit archive tombstones survive restart.
- Admin Clinics/theme and Web Auth/theme remain separate UI implementations. Evidence: backend lifecycle 7/7 plus integrated gates; Admin 122/122 and browser 27/27; Web 44/44 contracts, 94/94 Auth and browser 135/135.
- Live PostgreSQL migration/rollback, provider credentials, preview/live mutation cleanup, deployment and bundled JSON tenant remediation remain open or `BLOCKED`. Platform approval is Web/Admin-only; Android consumes membership/workspace status through native UI and firmware is `N/A`.
- Continue from `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` and `SMART_HEALTH_PRODUCTION_BACKLOG.md`; do not reopen this source slice without concrete regression evidence.

### 2026-07-23 Phase 6–7C Notifications checkpoint

- Migration 041 and JSON/PostgreSQL repositories now provide audited, idempotent, tenant-scoped notification campaigns with truthful per-channel delivery state. OpenAPI parsed with 54 paths and 48 schemas.
- Admin passed 128/128 contracts and the self-starting 36/36 browser matrix with a real local recipient campaign and cleanup. Web passed 94/94 Auth and 44/44 contracts; Android passed 176/176 and debug assemble while retaining native UI.
- Live PostgreSQL/provider/device/preview/deploy proof remains `BLOCKED`; firmware impact is `N/A`. Continue Phase 6–7D from the remaining ledger gaps.

### 2026-07-23 Phase 6–7D1 Overview checkpoint

- Admin/Portal Overview now uses real timestamp buckets for `today|7d|30d`, explicit timezone/range metadata, stable lifecycle keys and strict tenant-scoped totals. It no longer renders fallback zeros, fixed fake chart percentages, hardcoded trends, fake progress or a synthetic recent-alert timeline.
- Evidence passed: backend overview 4/4 plus integrated gates; OpenAPI 56 paths/53 schemas; Admin 135/135, type/lint/build/Firebase build and browser 45/45 with zero blocking accessibility/runtime/layout/theme/target findings.
- No live deploy is implied. Android actor-specific dashboards and firmware are `N/A` for this aggregate desktop read slice. Continue Phase 6–7D2 from the remaining `DATA-FAKE-011` gaps.

### 2026-07-23 Phase 6–7D2A Storage checkpoint

- Admin Storage now settles stats/files independently, strict-validates both read models, preserves partial/stale confirmed results and never renders a dormant aggregate zero fallback. Upload fails closed until the backend bucket catalog is confirmed; Devices uses the same strict file parser for firmware inventory.
- Semantic light/dark chart tokens, reduced motion, accessible chart summaries and 44 px actions are browser-verified. Evidence passed: Storage 13/13, Admin 138/138, type/lint/client+SSR/Firebase builds and browser 54/54 with zero blocking accessibility/runtime/layout/theme/target findings.
- No live deploy is implied. Existing S3/provider proof remains `BLOCKED`; Android and firmware are `N/A`. Continue D2 from the next reproduced gap.

### 2026-07-23 Phase 6–7D2B Patient CRUD checkpoint

- Backend, Platform Admin and Portal now keep canonical `patientId` separate from the human-facing `patientCode`. Create/edit/delete use structured clinical and contact fields, exact receipts, stable retry keys, tenant/capability checks and audited idempotent mutations; JSON-mode writes are serialized with rollback on persistence failure.
- Admin and Portal retain independent responsive UI. Browser proof passed Admin `63` route/viewport/theme checks plus real patient create/update/delete, and Portal Patients `9` viewport/theme checks plus exact replay and cleanup. The browser runs also found and fixed undersized targets and an invalid ARIA status label in the shared Portal shell.
- Regression evidence passed: backend check/base/repository/workspace/KLT gates; Admin `146/146` contracts plus type/lint/client+SSR/Firebase builds; Web `53/53` contracts and `96/96` Auth/UI tests plus type/lint/client+SSR/Firebase builds; Android family-profile unit tests and full debug unit/build gate.
- No live deploy is implied. Android keeps its native Family Profiles UX; emulator/device proof remains open. Firmware is `N/A`. Patient CSV Import is not closed by this slice and is the active D2C work item: `validate → preview → commit`, duplicate handling, expiry, transactionality and idempotency.

### 2026-07-23 Phase 6–7D2C Patient CSV Import checkpoint

- Backend now owns a persisted, tenant-scoped, 24-hour `validate → preview → commit` batch with UTF-8/5 MiB/5,000-row limits, structured patient validation, duplicate reporting, final conflict recheck, required idempotency and transaction-bound audit. Migration 042 and the JSON importer preserve the contract.
- Portal replaces the sequential row-create screen with an independent responsive workflow and complete operational states. Browser proof passed `18` viewport/theme checks plus real validation, atomic commit, replay and cleanup; an action-label contrast regression found by axe was fixed.
- Evidence passed: import `8/8`, full backend gates, OpenAPI `59/59`, Web `57/57` contracts, `97/97` Auth/UI, type/lint/client+SSR/Firebase builds. Live PostgreSQL/migration/deploy proof remains open. Android and firmware are `N/A`; continue D2 from the next reproduced truthfulness gap.

### 2026-07-23 Phase 6–7D2D Audit/Export checkpoint

- `/api/v1/audit-logs` is now the canonical append-only audit ledger with server-side query/filter/sort/pagination. `/api/v1/access-logs` and `/api/v1/portal/audit-log` remain compatibility aliases over the same contract; audit metadata is recursively secret-redacted before persistence and JSON fallback remains append-only.
- Migration 043 and renderer `shcare.export-artifact.v1` produce immutable backend JSON, UTF-8 CSV, OpenXML XLSX and PDF artifacts with persisted dataset/scope/filter metadata and SHA-256. Create/download are audited, create is idempotent and exact replay does not duplicate the audit outcome.
- Export capability and scope are explicit: Platform Admin can create platform-global audit exports; workspace owner/admin is workspace-scoped; doctor clinical data is limited to active patient grants; patient data is limited to owned/dependent profiles; billing and viewer are denied. Job list/download also enforce tenant and creator/manager visibility.
- Backend evidence passed `check:audit-export`, focused audit/export `12/12`, repositories, identity migrations, workspace access, `npm.cmd test`, KLT contract and OpenAPI `0.4.0`. The bundled JSON tenant mismatch and dangling-owner reference now have explicit remediation audit entries and no longer remain the current identity-import blocker.
- Platform Admin passed TypeScript, ESLint, `151/151` contracts, build and browser `72/72` across 390/768/1440 plus light/dark/system. The browser run found zero blocking accessibility/runtime/request/layout/theme/target issue and verified a real platform CSV Blob through SHA-256, response filename, BOM and cleanup. `xlsx` advisories are removed; `npm audit --omit=dev` still reports 17 other advisories (0 critical) for release review.
- Portal passed focused `8/8`, full Vitest `29` files/`105` tests, contracts `60/60`, TypeScript, ESLint, Firebase build and targeted browser proof. The browser filtered 147 audit rows to 11 `q=scan` rows on the server, downloaded the matching 11-row CSV, verified SHA prefix `4e031d2e6faa`, observed the create/download ledger pair and cleaned all local runtime data. Workspace/scope/renderer/hash drift fails closed.
- The full Portal route smoke is not claimed green: after obsolete selectors were repaired, the third rerun ended on dev-server timeout/`ERR_CONNECTION_REFUSED` before a product assertion. Portal `bun audit` reports 5 advisories (1 high, 3 moderate, 1 low); this harness/dependency evidence remains visible rather than being called complete.
- No live migration 043, live database/provider, authenticated preview/live artifact download or deployment is implied. Android workspace/platform audit UI is `N/A`; personal export/access-history is a separate native Settings/Security slice. Firmware is `N/A`.

### 2026-07-23 Phase 8B/8C release-candidate checkpoint

- Canonical release record:
  `docs/SMART_HEALTH_RELEASE_CANDIDATE_MANIFEST.md`.
- The complete Portal route smoke now passes locally; final Web evidence is
  `105/105` Auth/UI, `63/63` contracts, type/lint/Firebase build and browser
  `ok: true`.
- Fresh Admin, Android, brand/contracts and firmware candidate builds pass.
  The manifest records versions, SHA-256 artifacts, compatibility, explicit
  exclusions and rollback order.
- Portal now has a clean `bun audit` after compatible patched dependency pins
  and a green full gate rerun. Admin production-only audit is one low
  development-server advisory with zero high/critical findings.
- Active phase is intentional candidate commit/tag plus clean-worktree
  verification. PostgreSQL/provider preview/live, Android production
  signing/runtime and physical-board proof remain `BLOCKED`.
