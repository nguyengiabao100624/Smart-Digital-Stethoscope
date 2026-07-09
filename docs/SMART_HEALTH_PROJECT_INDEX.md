# Smart Health - Project Index

Last updated: 2026-07-09

This is the fastest navigation file for `D:\Study\KLTN`. Read it before opening broad folders or scanning the whole workspace.

## Start Here

Read in this order:

1. `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md` - current state, product direction, latest verified work.
2. `docs/SMART_HEALTH_PROMPT_REQUIREMENTS_HANDOFF.md` - broad prompt ledger, product invariants, closed slices, blockers, and next non-repeated slice.
3. `docs/SMART_HEALTH_IMPLEMENTATION_STATUS.md` - what is real, partial, scaffold, or still missing.
4. `docs/SMART_HEALTH_PRODUCTION_BACKLOG.md` - next production slices in priority order.
5. `docs/SMART_HEALTH_COMMANDS_GUIDE.md` - commands, envs, smoke tests, deploy notes.
6. `docs/SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` - Vietnamese operational setup checklist.

For product decisions, also read:

- `docs/SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`
- `docs/SMART_HEALTH_THIRD_PARTY_SETUP.md`
- `docs/SMART_HEALTH_AGENT_SKILLS_GUIDE.md`

## Whole-System Scope Contract

Smart Health means the full `D:\Study\KLTN` product system, not only one app or folder. Treat `smart-health-embedded`, `smart-health-android`, `smart-health-admin`, `smart-health-web`, Firebase, Render, Supabase/Postgres, object storage, firmware, smoke tooling, CI/deploy scripts, and the handoff docs as one connected product.

For any feature or fix, trace the user-facing workflow end to end before calling it done: backend API and repository policy, auth/role/tenant logic, web portal behavior, admin behavior, Android behavior when relevant, firmware/device behavior when relevant, live/provider data, tests/smokes, deploy impact, and docs/handoff. Do not complete isolated UI or backend changes when the adjacent client, permission model, smoke coverage, or production runbook also needs to change.

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

- Firebase Auth is the identity provider across Android, Web Admin, and Shcare Portal.
- Current Render backend is `https://smart-health-api-r5is.onrender.com` (`/api` base `https://smart-health-api-r5is.onrender.com/api`). The previous `smart-health-api-xj0a` workspace hit the free outbound bandwidth limit and is no longer the active production URL.
- Render, Firebase Hosting/Auth, Supabase Postgres, and Supabase S3-compatible storage were already set up earlier; do not ask to recreate Firebase/Supabase from scratch. Render was recreated in the new workspace on 2026-07-09 because Render does not support direct service transfer between workspaces.
- Supabase connector access is available for production-like DB inspection. On 2026-07-07 it confirmed project `smart-health-production` (`mahvymyncxszvuhlycwp`), applied migrations `001`-`008`, RLS-enabled public tables, no direct `anon`/`authenticated` grants, and no permissive public policies.
- `MSM261S4030H0` is the only active firmware target. Do not route new work to INMP441.
- Shcare Web registration email verification now uses a backend-generated Firebase verification link delivered through the outbound email provider stack.
- Backend notification creation now has a Firebase Cloud Messaging delivery path for direct user notifications, records push delivery status separately from platform-admin email fanout, persists per-attempt `pushAttempts` history without raw FCM tokens, and retries retryable provider failures with bounded env controls.
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
npm.cmd run check
npm.cmd run smoke:workspace-access
npm.cmd run smoke:repositories
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
bun run build:firebase
bun run smoke:portal-browser
bun run smoke:portal-mutation
```

Web Admin:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:production-roles

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run lint
npm.cmd run build:firebase:admin
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
