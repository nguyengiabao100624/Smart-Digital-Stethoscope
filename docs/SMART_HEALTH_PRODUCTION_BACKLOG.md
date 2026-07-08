# Smart Health - Production Backlog

Last updated: 2026-07-09

This backlog is ordered to reduce rework. Keep it updated after implementation so future new chats can start from this plan without re-reading the whole codebase and wasting quota/token.

## Production Direction Already Chosen

- Smart Health is one connected product workspace under `D:\Study\KLTN`, spanning `smart-health-embedded`, `smart-health-android`, `smart-health-admin`, `smart-health-web`, Firebase, Render, Supabase/Postgres/storage, firmware, smoke tooling, deploy automation, and handoff docs. Do not treat future work as done in only one folder when the workflow crosses surfaces.
- For each production slice, keep function, logic, backend policy, client behavior, device/provider side effects, verification, deploy notes, and handoff synchronized across the affected surfaces.
- Product direction is remote-first monitoring: connected device deployment, realtime remote audio, stored clinical audio, AI support, sharing, and workspace administration. It is not positioned as an in-room replacement for a traditional stethoscope.
- Canonical product direction is documented in `SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`.
- Device quota means activated/deployed devices in a workspace, not number of patients. One activated device can measure many patient/family profiles.
- Personal/family workspaces need dependent/family patient profiles under one account, with optional sharing to doctors/facilities.
- Clinic/hospital administration is web-first through `shcare.web.app` Workspace Portal. `shcare-admin.web.app` is only for Platform Admin/system administration.
- Keep the current Node.js backend for now; do not rewrite the framework just to look cleaner.
- Keep existing demo audio path working while production audio is added beside it.
- Use Firebase Auth for identity.
- Backend verifies Firebase ID tokens and gets roles/organization from DB/custom claims.
- Use PostgreSQL as production database.
- Keep JSON mode as a fast demo fallback.
- Separate planes:
  - MQTT/control: commands, telemetry, heartbeat, OTA event, device health.
  - Audio: WSS for realtime preview, HTTPS chunk upload for durable scan storage.
- Use S3-compatible object storage for production direction: MinIO local, R2/S3 production.
- Add Redis/BullMQ or equivalent for worker queue and multi-instance coordination when productionizing scans/AI.

## Completed - 2026-07-09 Render backend account migration and Firebase redeploy

- Recreated the backend on the new Render workspace because the previous `smart-health-api-xj0a` workspace hit the free outbound bandwidth limit and direct Render service transfer between workspaces is not supported.
- Current active backend is `https://smart-health-api-r5is.onrender.com` with API base `https://smart-health-api-r5is.onrender.com/api`.
- Updated the operational URL defaults in Shcare Web, backend smoke scripts, Web Admin mutation smoke, Android debug config, GitHub workflows, README files, and the project index.
- Redeployed `shcare.web.app` to Firebase Hosting version `projects/162993928259/sites/shcare/versions/ad466c939950664e` and `shcare-admin.web.app` to version `projects/162993928259/sites/shcare-admin/versions/35d5d0458143d1b4`.
- Verification passed: backend health/API checks, backend `check`, public deployment smoke, production-role smoke, portal production smoke, Shcare Web Firebase build and browser/mutation smokes, and Web Admin Firebase build/admin mutation smoke.
- Remaining risk: this is a successful host migration, not a bandwidth fix. The next infrastructure hardening slice should identify the Service-Initiated outbound traffic source and reduce backend egress, especially storage/audio/provider calls that can be handled by signed direct client/device upload/download paths.

## Completed - 2026-07-09 Shcare Portal consent/share workflow and smoke

- Reworked `shcare.web.app` `/portal/consent` so workspace users can create and revoke real patient-share grants instead of only seeing a minimal share shell.
- The portal now supports patient selection, doctor/workspace targets from `/api/share-targets`, full-profile vs selected-scan scope, optional expiry, active-share list, friendly target labels, and revoke buttons backed by `/api/portal/patients/:id/shares`.
- Added typed `ShareTarget` and `PatientShare` API contracts in `smart-health-web` and stable QA selectors for share rows, revoke buttons, and selected-scan scope.
- Expanded `bun run smoke:portal-browser` to assert consent/share controls and expanded `bun run smoke:portal-mutation` to create a share, verify backend 201, revoke it, verify backend 200, and clean up any unreverted share on failure.
- Verification passed: Shcare Web typecheck, lint, production build, Firebase build, targeted `git diff --check`, local preview browser/mutation smokes with `SMOKE_DISABLE_WEB_SECURITY=1`, Firebase Hosting deploy version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`, live browser smoke, and live mutation run `portal-mutation-mrcnnzcg` creating/revoking share `share_20260708223625_e69f019e`.
- Remaining share backlog is now outside this workspace portal slice: patient/personal/family-facing consent history UX, production Postgres/RLS proof for every repository-backed share path, and cross-device/user acceptance flows should be handled as separate slices unless this portal workflow regresses.

## Completed source/live API plus production schema - 2026-07-09 patient-share repository persistence

- Added backend repository support for patient-share grants so `GET/POST/DELETE /api/portal/patients/:id/shares` can use normalized `doctor_patient_access` rows instead of only the runtime JSON array.
- Added migration `009_doctor_patient_access_runtime_parity.sql` with nullable `doctor_user_id`, `doctor_id`, `scope`, JSONB `scan_ids`, revoke actor metadata, `updated_at`, and patient/doctor/workspace indexes.
- Applied and verified the production Supabase schema change in project `smart-health-production` (`mahvymyncxszvuhlycwp`) and inserted the app `schema_migrations` row `009_doctor_patient_access_runtime_parity` so Render startup migration will not replay duplicate constraints.
- Expanded JSON-to-Postgres migration and repository smoke coverage for share hydration, selected-scan persistence, guarded optional FKs, save, and revoke.
- Added a follow-up fix after live canary caught `POST /shares` returning a new share while immediate `GET /shares` returned zero rows. The repository list path now merges SQL and runtime shares, and the portal consent page optimistically inserts the created share into its cache before refetch.
- Verification passed locally: backend syntax checks, `npm.cmd run smoke:repositories`, `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run smoke:workspace-access`.
- Deployed source follow-up `c00f35f3` to `origin/main` and redeployed Shcare Web to Firebase Hosting version `projects/162993928259/sites/shcare/versions/9109e5cb08b4fd0d`, release `projects/162993928259/sites/shcare/channels/live/releases/1783553006684000`.
- Post-deploy live verification passed: public deployment smoke, direct API canary `direct-share-mrcphdbi-1` proving immediate create/list consistency for share `share_20260708232540_f6af5d2b`, authenticated portal production smoke, and Playwright portal mutation run `portal-mutation-mrcpi0yj` creating/revoking share `share_20260708232751_88243994`.
- Remaining proof gap: this shell still lacks Render CLI, Supabase CLI/psql, and local `DATABASE_URL`, so newly-created live share row insertion into normalized Supabase `doctor_patient_access` is not yet row-level proven. Use Supabase query access or Render DB/log access for that final persistence proof.

## Completed source/build/backend smoke - 2026-07-09 Android account password backend bridge

- Fixed Android `ChangePasswordScreen.kt` so change password updates Firebase when available, refreshes the ID token, and records the change through backend `/api/v1/me/password` with `firebaseClientUpdated=true`.
- Kept demo/backend-password compatibility by calling the backend with current/new password when no Firebase current user is present.
- Updated `SmartHealthApi.changePassword` to send the production Firebase acknowledgement flag expected by the backend.
- Expanded `smoke:workspace-access` to verify patient backend password change, old-password rejection, and new-password login in the temporary JSON backend.
- Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, backend `node --check scripts\workspaceAccessSmokeTest.js`, and backend `npm.cmd run smoke:workspace-access`.
- Remaining validation requires running the Android screen on an emulator or physical device with real Firebase credentials.

## Completed source/build/backend smoke - 2026-07-09 Android Data Access consent history

- Replaced Android Data Access local-only privacy switches with a backend-backed consent ledger.
- The screen now loads patient/family profiles, share targets, and patient-share grants; shows selected profile, active count, target label, active/revoked state, scope, selected-scan count, expiry, loading/error/empty/retry states; and revokes active grants through `DELETE /api/patients/:id/shares/:shareId`.
- Added `SmartHealthApi.revokePatientShare` and extended `PatientShare` with doctor/history metadata used by the UI.
- Backend `GET /api/v1/patients/:id/shares` now includes revoked grants through repository `includeRevoked` and JSON fallback parity so the consent ledger can show active and revoked history.
- Expanded `smoke:workspace-access` to seed a personal patient account and verify self/dependent profile isolation, dependent creation, share-target lookup, consent create/list/revoke, revoked-history visibility, and denial of workspace-owned patient profiles.
- Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, backend `node --check server.js`, backend `node --check scripts\workspaceAccessSmokeTest.js`, backend `npm.cmd run smoke:workspace-access`, backend `npm.cmd run check`, backend `npm.cmd run smoke:repositories`, and backend `npm.cmd test`.
- Commit `fde6ae4c` was pushed to `origin/main`; live `npm.cmd run smoke:public-deployment` passed, and live `npm.cmd run smoke:portal-production` passed on rerun after one transient Render 502.
- Remaining validation requires hardware/app runtime access: run this screen on a real Android device or emulator with patient/workspace credentials, verify the patient-facing UI visually, and continue separate real FCM delivery validation.

## Completed - 2026-07-07 Android/backend AI and data contract sync

- Fixed Android-facing AI chat history so `/api/v1/ai/chat` is scoped by caller user and workspace instead of exposing the global chat tail.
- Persisted `/api/v1/ai/settings` and `/api/v1/ai/update` through the same workspace-aware settings path used by admin settings, so workspace callers no longer mutate shared global AI settings.
- Scoped AI update notifications from both Android-facing `/api/v1/ai/update` and shared `/api/v1/settings/ai/update` with caller `userId` and `organizationId`.
- Fixed `/api/v1/data/cache` to return a caller-scoped storage summary after clearing cache.
- Expanded `smoke:workspace-access` to verify cross-tenant AI chat isolation, AI settings/update behavior, AI notification scoping, Android data summary/cache scoping, and workspace denial for destructive data reset.
- Local verification passed: backend `check`, backend `smoke:workspace-access`, backend `test`, Shcare Web build, Web Admin build, and Android debug assemble.
- Remaining items after this slice are provider/device evidence and production env validation, not another local source-level AI/data endpoint pass unless new regression evidence appears.

## Completed - 2026-07-07 workspace owner approval lifecycle

- Fixed the role/surface invariant for facility registration: Shcare Web `/register/phong-kham` creates a workspace-owner request, while doctor registration remains doctor-only.
- Backend workspace approval now drives owner `pending`, `needs_info`, `rejected`, and approved (`active`) states, including portal surface gating and Firebase custom-claim update/revoke when Firebase Admin is configured.
- Firebase auth refresh preserves backend-approved workspace roles and existing workspace organization when tokens do not carry an organization claim.
- Web Admin workspace page now exposes approval-state filters and explicit approve/request-info/reject/reopen actions instead of presenting workspace onboarding as a generic active/inactive clinic toggle.
- Shcare Web `/can-bo-sung` now resubmits workspace-owner needs-info cases through `/auth/workspace-request`; doctor needs-info still resubmits through `/auth/role-request`.
- Local verification passed: backend `check`, backend `test`, Web Admin lint, and Shcare Web typecheck. Production deploy/live smoke for this slice was completed by the later 2026-07-07 push/deploy rerun: backend/source commit `88877ad5`, Shcare Web version `projects/162993928259/sites/shcare/versions/fab6a2ad97c63420`, Web Admin version `projects/162993928259/sites/shcare-admin/versions/ce26044bb3730062`, live portal mutation run `portal-mutation-mrad4yzw`, and live admin mutation run `admin-mutation-mrad8n0r`.

## Completed - 2026-07-07 broad prompt requirements handoff

- Added `docs/SMART_HEALTH_PROMPT_REQUIREMENTS_HANDOFF.md` for the broad product-hardening prompt so future chats do not repeat completed slices.
- The handoff records product invariants, active repo map, closed Role/Auth/Register/Approval/RBAC work, live deploy versions, smoke run ids, remaining Blocker/High/Medium/Polish checklist, and the next recommended non-repeated slice.
- Next practical backlog item was repository-backed tenant isolation with production-like Supabase/Postgres data; do not redo the closed role/surface/deploy slice unless new regression evidence appears. A local 2026-07-07 strict production gate probe returned `BLOCKED` because this PowerShell process lacks production envs (`DATA_BACKEND`, `DATABASE_URL`, Firebase Admin, public backend URL, S3/object storage, PHI key), so the follow-up used the Supabase connector instead of repeating the local gate.

## Completed - 2026-07-07 Supabase/Postgres repository parity probe

- Used the installed Supabase connector for project `smart-health-production` (`mahvymyncxszvuhlycwp`) and confirmed the production-like database is healthy on Postgres 17.6.
- Confirmed migrations `001_init` through `008_notification_push_attempts` are applied, public tables have RLS enabled, `anon` and `authenticated` have no direct public table grants, and `pg_policies` has no permissive public policies.
- Found and recorded one normalized/runtime drift: `app_runtime_state` had `organizations=9` while normalized `public.organizations` had `10`; the missing runtime org was the audit-linked admin mutation smoke artifact `org_admin_mutation_mrad8n0r`.
- Hardened backend repository hydration so normalized SQL rows are authoritative even when a table is empty, preventing stale runtime snapshot rows from surviving in Postgres-backed mode.
- Hardened optional FK upserts for user `patient_id`, patient `owner_user_id`, and device `paired_user_id` so missing optional references become `NULL` instead of causing Postgres FK failures.
- Local verification passed: `node --check src\repositories.js`, `node --check scripts\repositoriesSmokeTest.js`, `npm.cmd run smoke:repositories`, `npm.cmd run check`, and `npm.cmd run smoke:workspace-access`.
- Deployed through commit `6d902355` pushed to `origin/main`; live `npm.cmd run smoke:public-deployment` and `npm.cmd run smoke:portal-production` passed.
- Supabase confirmed the runtime snapshot is synced after deploy: `runtime_organizations=10`, `normalized_organizations=10`, `runtime_users=12`, `normalized_users=12`, updated at `2026-07-07 11:54:34+00`.
- Next non-repeated backlog is provider/hardware evidence: real Android FCM delivery, real email inbox click-through, storage/signed URL mutation parity, and physical MSM261 ESP32-S3 validation.

## Completed - 2026-07-07 storage contract and performance smoke follow-up

- Expanded backend workspace smoke storage coverage: share URL, authenticated local-object URL read, direct download content, cross-workspace signed URL/download denials, upload metadata, list visibility, download of uploaded content, delete cleanup, and post-delete 404.
- Added `bun run smoke:performance` in `smart-health-web`. It uses Playwright against live `https://shcare.web.app`, signs in with the workspace smoke account, measures public home/login plus portal dashboard/patients/records/devices/settings, and fails on browser errors, blank renders, or transfer/load budget regressions.
- Verification passed: `node --check scripts\workspaceAccessSmokeTest.js`, `npm.cmd run smoke:workspace-access`, `node --check scripts\performanceSmokeTest.mjs`, and `bun run smoke:performance`.
- Live Firebase/Render verification also passed after loading the local Firebase Admin JSON path: `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`, `npm.cmd run smoke:firebase-email`, and `npm.cmd run smoke:public-deployment`.
- Commit `edd419ef` was pushed to `origin/main`; post-push live `npm.cmd run smoke:public-deployment` and `npm.cmd run smoke:portal-production` passed.
- Remaining provider/hardware backlog: real Android FCM delivery with a real device token, real email inbox click-through, production S3/Supabase Storage provider smoke with provider envs, and physical MSM261 ESP32-S3 WiFi/audio/OTA evidence. Current probes found no attached Android device and no ESP32-S3 serial device.

## Completed - 2026-07-07 repository list hydration and admin mutation follow-up

- A whole-system verification pass found one live regression: Web Admin `npm.cmd run smoke:admin-mutation` failed because PATCH `/devices/dev_admin_mutation_*` returned 404 after device provisioning.
- Root cause: repository list hydration could replace runtime devices/patients with the SQL list and drop rows created in the current process when normalized SQL did not yet contain them. A background `/devices` list in Web Admin could therefore remove the smoke device before PATCH.
- Commit `27f309be` preserves runtime-created patients/devices during SQL-backed list hydration and adds repository regression coverage.
- Verification passed: backend `check`, backend `test`, `smoke:workspace-access`, `smoke:repositories`, public deployment smoke, and live Web Admin `smoke:admin-mutation` run `admin-mutation-mran2ji6` with HTTP 200 cleanup for settings, notification, storage bucket, device, patient, package, and workspace.

## Provider/hardware validation re-probe - 2026-07-07

- Network-enabled local verification passed for backend `check`, `test`, `smoke:firebase-email`, `smoke:storage`, `smoke:notification-push`, `smoke:public-deployment`, `smoke:production-roles`, `smoke:portal-production`, `smoke:workspace-access`, `smoke:repositories`, and `smoke:api-production`. `smoke:mqtt` skipped because `MQTT_URL` is not set.
- `smoke:firebase-email` passed with `FIREBASE_PROJECT_ID=smart-health-stethoscope` and the local Firebase Admin JSON path, proving Firebase verification-link generation for `https://shcare.web.app/xac-nhan-email`. It still does not prove real Gmail inbox receipt/click-through.
- Live Shcare/Web Admin verification passed: `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` run `portal-mutation-mraqouwy`, `bun run smoke:performance`, Shcare Web lint/typecheck/Firebase build, `npm.cmd run smoke:admin-mutation` run `admin-mutation-mraqkmzo`, and Web Admin lint/Firebase build.
- Android and firmware source/build verification passed: Android `:app:compileDebugKotlin`, `:app:assembleDebug`, and `:app:assembleRelease`; MSM261 PlatformIO `esp32-s3-devkitm-1` and `esp32-s3-ota`.
- Gmail inbox validation still needs a signed-in Gmail session or mailbox/API credentials; the earlier browser probe opened Google sign-in, not an authenticated mailbox.
- Current local process still lacks production provider envs, so `npm.cmd run check:production` reports `BLOCKED` with local-demo/provider failures for auth mode, Firebase Admin env, public backend URL, Postgres, S3/object storage, PHI encryption, email/SMS/Zalo/MQTT providers, and OTA URL.
- Hardware access remains absent: Android SDK `adb.exe` exists but `adb devices` showed no attached devices, and PlatformIO returned no ESP32-S3 serial device. `render`, `supabase`, `firebase`, and `gcloud` CLIs were not on PATH.
- Next non-repeated action is not more source work unless new failures appear. Provide the missing Gmail session/provider envs/Android device/ESP32-S3 board, then run the corresponding real validation.

## Completed - 2026-07-07 account profile tenant hardening

- Backend `/api/v1/me` no longer lets account/profile edits self-create membership or switch tenants by sending `hospital` text.
- Explicit `organizationId` / `clinicId` / `clinic` profile switches require an existing membership; unauthorized attempts return `WORKSPACE_MEMBERSHIP_REQUIRED` and leave the current workspace unchanged.
- `npm.cmd run smoke:workspace-access` now includes the cross-workspace `/api/v1/me` denial case. Backend `check`, `smoke:workspace-access`, and `test` passed locally.
- Sanitized setup documentation so Brevo/API keys are referenced as ignored env vars rather than stored inline.

## Completed - 2026-07-07 device transfer hardening

- Device transfer is still platform-admin-only and now validates that the target workspace exists before mutating the device.
- Transfer with `ownerUserId` now requires the target user to exist and belong to the target workspace or have membership there.
- `npm.cmd run smoke:workspace-access` covers non-platform denial, missing-workspace denial, mismatched-owner denial, and valid transfer to a matching workspace user. Backend `check` and `smoke:workspace-access` passed locally.

## Completed - 2026-07-07 selected scan sharing hardening

- Backend `GET /api/v1/scans` now uses `canAccessScan` per row, so `selected_scans` grants do not leak sibling scan metadata for the same patient.
- `npm.cmd run smoke:workspace-access` now seeds an external doctor selected-scan grant and verifies only the granted scan is listed/openable while the sibling scan is hidden/403. Backend `check` and `smoke:workspace-access` passed locally.

## Completed - 2026-07-07 notification target scoping

- Backend notification creation now validates optional `userId` targets: non-platform users can target only themselves or users in the current workspace/membership.
- `POST /api/v1/notifications` returns 404 for missing target users and 403 for cross-workspace targets, and normalizes target ids to backend user ids.
- `npm.cmd run smoke:workspace-access` covers same-workspace direct notification creation and cross-workspace target denial. Backend `check` and `smoke:workspace-access` passed locally.

## Completed - 2026-07-07 export workspace validation

- Platform export creation now rejects missing target workspaces instead of creating export metadata for arbitrary `organizationId` values.
- Workspace export creation still ignores cross-workspace payload `organizationId` and uses the caller current workspace.
- `npm.cmd run smoke:workspace-access` covers both cases. Backend `check` and `smoke:workspace-access` passed locally.

## Completed - 2026-07-07 live UI dead-control and mobile overflow verification

- Live role smoke passed and refreshed the platform/workspace/doctor smoke credentials.
- Live Portal browser and mutation smokes passed on `shcare.web.app`, including route buttons, records filters, popovers, device claim/assignment, patient CRUD, notification CRUD, workspace settings/preferences restore, report CSV export, support ticket cleanup, logout, and session recovery.
- Live Web Admin mutation smoke passed on `shcare-admin.web.app`, including workspace, package, patient, device, notification, storage bucket, settings mutations, and cleanup.
- A mobile 390x844 Playwright pass found no horizontal overflow and no console/page errors across public/auth, authenticated portal, and authenticated admin key routes.

## Completed — 2026-06-24 Shcare Portal release

- Deployed the doctor/clinic Workspace Portal to Firebase Hosting target `webapp -> shcare`: `https://shcare.web.app`, version `0cace76db422ed7c`, release `1782257445764000`. SPA routes do not cache the HTML entry; fingerprinted assets stay cacheable.
- Redesigned and QA-checked the public/contact/auth journey in light and dark mode, including mobile overflow, images, links, page titles/H1s, labels, names, and password autocomplete.
- Added the `Signal Horizon` UI layer after the initial clinical base: expressive floating pill nav, cinematic/painterly hero atmosphere, frosted cards, richer violet-blue-cyan gradients, and CSS motion inspired by the local `MẪU UI UX` references plus live Origin, Mercury, dope.security, and General Intelligence Company reads. Keep this modern direction unless the user explicitly asks to simplify it.
- Confirmed the live portal document and the Render backend health endpoint return HTTP 200.
- Added `.github/workflows/deploy-shcare-web.yml` for build/deploy once the required GitHub secrets are configured.

## Completed — 2026-06-30 Shcare Web build/deploy hardening

- Restored the missing `smart-health-web` project manifest/build files: `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.firebase.config.ts`, `index.html`, `firebase.json`, `.firebaserc`, `bunfig.toml`, and `eslint.config.js`.
- Split the React Router app at layout/page lazy boundaries. Firebase build now produces a small SPA entry (`index-e8iN3TOO.js` about 59 kB) plus route chunks; no JS chunk exceeds Vite's 500 kB warning threshold.
- Added direct React Router `hydrateFallbackElement` on lazy route groups so local/live Chrome console has no HydrateFallback warning.
- Extended `smoke:workspace-access` to cover `GET /api/portal/status`: workspace users receive the expected scoped counts/status, while platform admin is rejected from the portal surface.
- Deployed Firebase Hosting site `shcare`: version `projects/162993928259/sites/shcare/versions/b4872b04beaabdec`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782803246138000`.

## Completed — 2026-07-01 Shcare public/auth UI defect fix

- Fixed the user-reported UI defects on `shcare.web.app`: public CTA/handoff contrast in light/dark modes, login input icon visibility, doctor registration step-2 choice selection, and top-of-home hero theme behavior.
- Home video hero now stays dark while the visitor is at the top of `/` even if global light mode is active; after scrolling below the hero, the page smoothly returns to the active light theme.
- Doctor registration step 2 now uses real radio inputs for `Bác sĩ Tư nhân` and `Cơ sở Y Tế / BV`, with whole-card click targets and selected-state styling.
- Follow-up visual-fit hardening fixed the desktop-low hero crop/fit issue, kept the preview mockup within the viewport, and made the registration radio indicator follow `input:checked` directly so selected state cannot visually drift.
- Verified local and live Chrome desktop/mobile QA: 1920x768 and 1536x768 hero fit, no horizontal overflow at 393px, route scroll reset to `0`, clean console, login icons visible, registration choices selectable, and live CSS asset `index-aaZfmmcI.css`.
- Deployed Firebase Hosting site `shcare`: version `projects/162993928259/sites/shcare/versions/c200f17fb8931766`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782855884181000`.

## Completed — 2026-07-01 Firebase doctor role/surface sync

- Fixed the live contradiction where `baobee100624@gmail.com` was shown as a system-admin account on `shcare.web.app` but rejected on `shcare-admin.web.app`. Actual live state before the fix was Firebase claim `role=doctor`, backend `role=patient`, `allowedSurfaces=["android"]`.
- Backend now syncs trusted Firebase custom claim `doctor` into approved doctor role, portal/android surfaces, membership role, and catalog workspace context. Catalog workspace `vn_hospital_quan_y_175` is materialized so `/api/me` can return `Bệnh viện Quân y 175`.
- Shcare Portal login now shows distinct denial messages for Android-only/patient, pending, needs-info, rejected, portal-denied, and platform-admin accounts instead of routing all non-portal accounts to admin.
- Production smoke now covers platform admin, workspace admin, and doctor portal with real Firebase accounts. Live verification passed after backend commit `be70b551`, `shcare` release `1782922148098000`, and `shcare-admin` release `1782922169045000`.

## Completed - 2026-07-02 MSM261 firmware-only correction

- Re-ran the practical production smoke matrix across backend, live Render/Firebase Hosting, Shcare Portal, Web Admin, Android compile, and firmware compile. Backend contract, production role smoke, local API production smoke, live public deployment smoke, web builds, Android compile, and MSM261 firmware passed.
- Re-audited `baobee100624@gmail.com` through Firebase Admin custom-token sign-in and live Render `/api/me`; it now resolves to approved `doctor` portal access in `Bệnh viện Quân y 175` with no platform capabilities.
- Confirmed `https://shcare.web.app` live main bundle contains the Render API base and no `localhost:3000` fallback. Confirmed `https://shcare-admin.web.app` fetched JS assets no longer contain the old `Tài khoản chưa có quyền quản trị` text.
- Corrected the active firmware scope: `D:\Study\KLTN\smart-health-embedded\MSM261S4030H0` is the only production firmware target. INMP441 is retired from the current product scope and should not be used for future product integration decisions.
- Still not possible from this workspace to inspect or push Render host envs because there is no Render CLI, API key, service id, or `render.yaml`. Keep using live smoke until Render dashboard/API access is available.

## Completed - 2026-07-02 web registration email verification hardening

- Replaced the weak Shcare Web registration assumption that Firebase client-side `sendEmailVerification()` request acceptance means inbox delivery succeeded.
- Added backend `POST /api/auth/email-verification` to generate Firebase Admin verification action links and send branded verification email through the existing Brevo/SMTP outbound provider stack.
- The backend endpoint keeps the OOB verification link server-side only, returns `verified` for already verified accounts, and returns explicit provider/Firebase configuration errors when delivery cannot happen.
- Shcare Web registration completion now reports whether backend email delivery succeeded. If provider envs are missing, it says the profile/workspace request was saved but verification email was not sent, and routes the user to the email verification/resend page.
- Auth/session routing was fixed so pending/needs-info/rejected onboarding accounts keep their Firebase/backend session and land on the correct status pages instead of being signed out as wrong-surface users.
- Added `npm.cmd run smoke:firebase-email` and ran it successfully against Firebase Admin for `https://shcare.web.app/xac-nhan-email`.
- Ran backend, web, admin, Android, and MSM261 build/smoke matrix after the change. Local strict production readiness remains blocked only because provider envs are not loaded locally, including Brevo email envs.
- Deployed backend commit `7ca15841` to Render and Shcare Web Hosting version `aac78c3631f574b4` to `https://shcare.web.app`.
- Live production email canary passed: temporary unverified Firebase doctor account called `/api/auth/email-verification`, Render returned `status=sent` and `provider=brevo`, and the temporary backend user was deleted. Live CORS from `https://shcare.web.app` to the endpoint passed.

## Completed - 2026-07-02 Shcare Web source and CI tracking

- Moved `smart-health-web` from untracked local-only state into the Git staging set with source, config, lockfile, required runtime assets, and Firebase Hosting config.
- Added `.github/workflows/deploy-shcare-web.yml` so future pushes touching `smart-health-web/**` run Shcare Web install/lint/build checks in GitHub Actions. Deploying `shcare.web.app` from GitHub Actions is manual-only and still requires Firebase repository secrets.
- Updated `.gitignore` so generated web build/cache output remains untracked while the required home-page video asset is tracked.
- Verified the tracked web project with `bun install --frozen-lockfile`, `bun run lint`, `bunx tsc --noEmit --pretty false`, and production `bun run build:firebase`.

## Completed - 2026-07-04 notification push backend delivery path

- Added backend Firebase Cloud Messaging delivery for direct user notifications with registered enabled FCM tokens. Push delivery status is recorded separately from platform-admin email fanout, so email `deliveryStatus` and mobile `pushStatus` do not overwrite each other.
- Added repository helpers to list enabled notification-device tokens by user and disable invalid/unregistered FCM tokens after Firebase rejects them.
- Added migration `007_notification_push_delivery.sql` for push delivery status/timestamps/error text.
- Added migration `008_notification_push_attempts.sql` for per-attempt push delivery history.
- Push attempts are persisted in `pushAttempts` without raw FCM tokens; token references are short SHA-256 hashes, and retryable failures are retried with bounded `PUSH_NOTIFICATION_MAX_RETRIES`/`PUSH_NOTIFICATION_RETRY_MS` controls.
- Added `npm.cmd run smoke:notification-push` and verified the local no-Firebase case records `pushStatus=skipped` instead of breaking notification creation.
- Verification passed: `smoke:notification-push`, `check`, `smoke:workspace-access`, and `smoke:repositories`; the smoke now also asserts the local `skipped` path writes `pushAttempts[0]`.

## Completed - 2026-07-04 workspace cleanup and handoff navigation

- Added `docs/SMART_HEALTH_PROJECT_INDEX.md` as the entrypoint for active source folders, live URLs, current state, safe cleanup rules, and focused smoke commands.
- Root README now points readers to the project index before the detailed handoff docs.
- Root `.gitignore` now excludes local agent/tooling cache folders that are not project source: `.config/`, `.impeccable/`, `.npm-cache/`, and `codex-telegram-bridge/`.
- Cleaned `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` so it starts with current setup policy and global skill storage guidance instead of an obsolete raw install request.

## Completed - 2026-07-05 web build-env, admin export, lint cleanup, and live deploy

- Shcare Web Firebase builds no longer require manually copying production env variables from the Web Admin shell command. `scripts/production-env.js` resolves process/web-local/fallback env files, applies safe production defaults, and is loaded by both validation and `vite.firebase.config.ts`.
- `bun run build:firebase` now passes in `smart-health-web` with the Render API base embedded and zero `localhost:3000` API fallback hits in `dist-firebase`.
- Web Admin PDF export no longer drags generated Roboto base64 TS modules into the export utility bundle. The font is served as `public/fonts/roboto-regular.ttf` and loaded on demand only for PDF export.
- Web Admin client `export-utils` output is about 13 KB, and both `npm.cmd run build` and `npm.cmd run build:firebase:admin` pass without the previous export-font chunk warning. The remaining large `xlsx` asset is a lazy export-library chunk, not the shared admin shell.
- Web Admin lint is now warning-free after moving Fast Refresh-incompatible non-component exports into helper modules.
- `scripts/publicDeploymentSmokeTest.js` now uses a 60s default request timeout, supports `SMOKE_REQUEST_TIMEOUT_MS`, and reports the URL that timed out so Render cold starts do not look like product failures.
- Deployed verified local builds to Firebase Hosting on 2026-07-05: `shcare.web.app` version `projects/162993928259/sites/shcare/versions/82dea8d245b9eee7` and `shcare-admin.web.app` version `projects/162993928259/sites/shcare-admin/versions/eb467019efffe1b4`.
- Browser smoke found and fixed the Shcare Portal unauthenticated deep-link crash where `/portal/patients` rendered `No QueryClient set`; the SPA now has a root `QueryClientProvider` and redirects unauthenticated portal deep links to `/login`.
- Additional cache-bypassed browser smoke passed for `/portal/devices`, `/portal/records/review`, `/portal/settings`, and Web Admin `/admin-actions`: all redirect unauthenticated users to login without console warnings.
- Authenticated Chrome smoke passed for workspace-admin read routes and doctor read routes on `shcare.web.app`. Chrome form-field issues on portal filter/forms were fixed by adding stable `id`/`name` attributes across portal inputs/selects/textareas, then redeployed.
- Post-deploy verification passed: public deployment smoke, production role smoke, backend check/test/workspace/repository/API/storage/notification-push smoke, Shcare Web production build, Web Admin warning-free lint/build/Firebase build, Android compile/assemble, and MSM261 normal/OTA firmware builds.

## Completed - 2026-07-05 authenticated portal production API smoke

- Added `npm.cmd run smoke:portal-production`.
- The smoke reuses the temporary credential file from `npm.cmd run smoke:production-roles`, signs in through Firebase Identity Toolkit, and checks live Render with bearer tokens without logging passwords or ID tokens.
- Verified platform-admin accounts are rejected from `/api/portal/status` with 403.
- Verified workspace-admin account can read `/api/me`, portal status, overview, patients, scans, notifications, devices, monitoring, reports, audit log, and settings.
- Verified doctor portal account can read `/api/me`, portal status, overview, patients, scans, and notifications.
- Passed against `https://smart-health-api-xj0a.onrender.com` after rerunning `smoke:production-roles`.

## Completed - 2026-07-05 Shcare Portal browser smoke and dropdown fix

- Fixed the live avatar dropdown layering issue in the Shcare Portal topbar. Avatar and notification popovers now render above records filters/table/cards instead of being hidden underneath them.
- Added Playwright dev dependency and `bun run smoke:portal-browser` in `smart-health-web`.
- The browser smoke signs into live `https://shcare.web.app` with the workspace smoke account, verifies Firebase `/api/auth/firebase`, portal API reads, records search/status controls, sidebar route buttons, avatar dropdown, notification dropdown, and the audit link inside the avatar menu.
- Deployed to Firebase Hosting site `shcare`, version `projects/162993928259/sites/shcare/versions/245f0489b45b35dc`.
- Verification passed: `bun run smoke:portal-browser`, Shcare Web lint/typecheck/Firebase build, backend `smoke:portal-production`, and `git diff --check`.

## Completed - 2026-07-05 Shcare Portal mutation smoke tooling

- Added stable QA selectors for portal mutation controls across patients, patient detail, device assignment, notifications, reports, workspace settings, notification preferences, help/support ticket, and topbar logout.
- Expanded the read-only `bun run smoke:portal-browser` route coverage to include live monitoring, consent, staff, alerts, onboarding, help, workspace switcher, billing, review queue, and device assignment routes in addition to the original dashboard/patients/devices/records/reports/settings/notifications/audit coverage.
- Help page quick-guide cards now use lucide icons and real button behavior to prefill support requests instead of emoji/cursor-only cards.
- Added `bun run smoke:portal-mutation` in `smart-health-web`. The script performs controlled UI/API mutation coverage with deterministic cleanup: create/update/delete patient, optional device assignment with restore, create/read/delete notification, settings save/restore, notification preference save/restore, report CSV export, support ticket submit/cleanup, missing-patient 404, logout, and session recovery.
- Local verification passed: script syntax checks, Shcare Web lint, typecheck, Firebase build, and targeted diff whitespace check.
- 2026-07-06 live execution passed on `https://shcare.web.app` after final fixes; see the completed live E2E entry below.

## Completed - 2026-07-06 Shcare Web login and live portal E2E

- Fixed the screenshot-class login defect on `shcare.web.app`: Firebase `auth/invalid-credential` now renders a safe Vietnamese message with `shcare-admin.web.app` guidance instead of exposing raw Firebase SDK text.
- Added accessible login error markup (`#login-error[role="alert"]`) and verified it in a mobile-width browser smoke.
- Audited `nguyengiabao100624@gmail.com` through Firebase Admin: it is an enabled, email-verified password account with platform-admin claims. It belongs on `shcare-admin.web.app`; an invalid-credential result on `shcare.web.app` means Firebase rejected the credential before portal role checks.
- Fixed the protected-route redirect console regression by removing unstable redirect state from `PortalLayout.tsx`.
- Removed the unsupported workspace `representative` field from the portal UI and moved mutation smoke to a persisted workspace field.
- Hardened mutation smoke for live permission behavior: direct-user notification creation and expected 404 filtering.
- Deployed final Shcare Web Firebase Hosting version `projects/162993928259/sites/shcare/versions/f9ca61aea825f375`, release `projects/162993928259/sites/shcare/channels/live/releases/1783335390544000`.
- Final live verification passed: `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:portal-production`, `bun run smoke:portal-browser`, invalid-login browser smoke, and `bun run smoke:portal-mutation`. The mutation smoke covered patient create/update/delete, device assign/restore, notification create/read/delete, workspace settings save/restore, notification preference save/restore, report CSV export, support ticket submit/cleanup, expected 404 state, logout, and login recovery.

## Completed live - 2026-07-07 portal/admin device, needs-info, and form hardening

- Fixed the cross-surface gap where Web Admin could request bổ sung hồ sơ but Shcare Web did not give the doctor a real resubmit workflow. `/can-bo-sung` now renders requested fields and optional document upload, posts the updated role request, refreshes account state, and returns to pending review.
- Added Shcare Portal self-service device claiming: `/portal/devices/claim`, a Devices-page `Them thiet bi` CTA, and `activateDeviceByClaim(...)`. Backend allows a workspace user with device visibility to claim a provisioned same-workspace device only with a valid claim code; no-code arbitrary creation remains restricted to device managers.
- Exposed the existing Web Admin Devices surface in Platform Admin navigation for `platform.devices.view` / `platform.devices.manage`, so full-right admin accounts can reach add/activate/manage device workflows.
- Improved account/notification popover readability in Shcare Portal by forcing final theme-layer backdrop blur and stronger translucent backgrounds; browser smoke now asserts the blur exists.
- Expanded smoke coverage: backend workspace smoke verifies doctor claim-code pairing and no-code denial; portal browser smoke visits `/portal/devices/claim`; portal mutation smoke provisions, claims, and cleans up a device through the claim page.
- Added `method="post"` to Shcare Web and Web Admin React forms so native/pre-hydration form submission cannot leak credentials or other form fields in the URL query string.
- Pushed backend tenant-hardening commit `88877ad5` to `origin/main` for Render auto-deploy. This commit tightens `/api/v1/me` workspace switching, scan row filtering, notification direct-user targets, device transfer target validation, and export organization scoping.
- Deployed Shcare Web Firebase Hosting version `projects/162993928259/sites/shcare/versions/fab6a2ad97c63420`, release `projects/162993928259/sites/shcare/channels/live/releases/1783411275583000`.
- Deployed Web Admin Firebase Hosting version `projects/162993928259/sites/shcare-admin/versions/ce26044bb3730062`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783411298455000`.
- Live verification passed: `smoke:public-deployment`, `smoke:portal-production`, `smoke:production-roles`, `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` run `portal-mutation-mrad4yzw`, and `npm.cmd run smoke:admin-mutation` run `admin-mutation-mrad8n0r`. Source/build verification also passed across backend check/test/workspace/repository/notification/storage smokes, Shcare Web lint/typecheck/Firebase build, Web Admin lint/Firebase build, Android compile, and MSM261 normal/OTA PlatformIO builds.
- Remaining constraints are provider/hardware, not this source slice: local `check:production` is still blocked without production envs in the local shell; Android release has deprecated Compose icon warnings; physical ESP32-S3 heartbeat/audio/OTA evidence still needs connected hardware.

## Completed live - 2026-07-07 Web Admin destructive mutation smoke

- Added Playwright-backed `npm.cmd run smoke:admin-mutation` in `smart-health-admin\thiết kế giao diện`.
- The smoke signs into live `https://shcare-admin.web.app` with the platform smoke account from backend `smoke:production-roles`, then runs authenticated browser-fetch mutations against `https://smart-health-api-xj0a.onrender.com/api`.
- Covered mutations: platform workspace create/patch/delete, package create/patch/assign/delete, patient create/patch/delete, device provision/patch/delete, notification create/read/delete, storage bucket create/delete, and settings patch/restore. It also route-checks overview, devices, patients, clinics, packages, notifications, storage, settings, admin accounts, and audit log.
- Verification passed: Web Admin `node --check scripts\adminMutationSmokeTest.mjs`, Web Admin `npm.cmd run lint`, backend `npm.cmd run check`, backend `npm.cmd run smoke:production-roles`, and live `npm.cmd run smoke:admin-mutation`.
- Latest live run `admin-mutation-mrad8n0r` completed with HTTP 200 cleanup for settings, notification, storage bucket, device, patient, package, and workspace, so the previous deeper Web Admin destructive mutation backlog item is closed for the covered controlled platform flows.

## Next production slice - provider and hardware validation

1. Verify Supabase/Postgres RLS and repository-backed tenant isolation with production-like data; do not rely on JSON/demo smoke alone.
2. Run Lighthouse/browser performance regression on the split production bundle and confirm the lazy export/media/font delivery remains acceptable after deployment.
3. Confirm human inbox receipt for the production email canary or a fresh real registration email, including spam/promotions folders, then click the verification link and confirm Firebase `emailVerified` transition.
4. Run real Android-device FCM delivery smoke against Render with a real device token, then inspect `pushAttempts` for provider errors and tune retry limits if needed.
5. Run physical ESP32-S3 flash/serial heartbeat/audio/OTA evidence after a board is connected and provisioned; the current machine only exposed Bluetooth COM5/COM6 during `platformio device list`.

## Backend audit - 2026-07-01 after Shcare UI release
- Passed: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, and rerun `npm.cmd run smoke:public-deployment`.
- Follow-up source fix completed for Web Admin/Portal backend contract: `/api/v1/devices/:id/events` is now handled in the device route with scoped read access, and single notification delete no longer crashes through an unrelated device assertion. `smoke:workspace-access` now covers device event scope and `/api/portal/notifications/:id` delete.
- Portal backend-contract smoke was expanded and passed locally: public contact, portal status/overview/monitoring/reports/audit, patient CRUD, patient share/revoke, scan update, device assign/command, staff create/list, settings/workspace patch, account notification preferences, share-target tenant scoping, notification read/read-all/delete, device-event scoping, and cross-workspace denials.
- Deployed the backend route-contract fix through commit `409a3592` pushed to `origin/main`. Live verification passed: `smoke:public-deployment`, `smoke:production-roles`, and a doctor view-only canary confirmed HTTP 200 for `GET /api/v1/devices/lite-steth-a92/events` without `workspace.devices.manage`.
- Deployed production tooling through commit `71a38f3e`: Render `npm start` now applies tracked SQL migrations when `DATABASE_URL` exists, migration `006_secure_public_tables.sql` denies direct Supabase table access to `anon`/`authenticated`, public smoke covers the Shcare Portal rewrites, and repository metadata smoke is tracked.
- Fixed and redeployed the Shcare Portal frontend auth build: previous live bundle still pointed API calls at `http://localhost:3000/api`, causing login/register to show a backend/CORS-style connection error. New Firebase Hosting `shcare` version `e59c69dd22c36505` points at `https://smart-health-api-xj0a.onrender.com/api` and passed browser/API smoke.
- Do not redo provider setup from scratch: earlier docs confirm the project already has Render backend `https://smart-health-api-xj0a.onrender.com`, Firebase Auth/Hosting, Supabase Postgres, and Supabase Storage S3-compatible config. `check:production:strict` exits nonzero in local PowerShell because local env does not include Render secret envs. Next work is provider/runtime hardening where env access is available: Supabase/Postgres RLS parity, real email inbox confirmation, real FCM device delivery, performance regression, and physical ESP32-S3 validation.

## Recently Completed - 2026-06-06 Cloud Device Slice

- Web Admin Devices page now uses backend cloud as the main device-management surface instead of pointing operators to `smarthealth-xxxxxx.local/admin`.
- Backend added outbound ESP WebSocket registration, heartbeat/telemetry persistence, device event history, command delivery, and cloud OTA command creation.
- Backend storage upload now records SHA-256/firmware metadata for bucket `device-firmware`, and cloud OTA can create a short-lived tokenized firmware download URL from an uploaded `.bin`.
- Web Admin Devices can select uploaded firmware from `device-firmware`, prefill version/checksum, and still supports manual URL/checksum fallback.
- Android device/settings/dashboard/live-audio screens now consume backend cloud status fields instead of presenting Bluetooth as the production status path.
- Firmware `MSM261S4030H0` now sends heartbeat/audio/events outbound to backend, receives cloud commands, performs HTTPS firmware download with SHA-256 verification, and uses local AP `SmartHealth-xxxxxx` only for WiFi SSID/password recovery.
- LAN ArduinoOTA/espota remains available only as an explicit development mode with `SMART_HEALTH_ENABLE_LAN_OTA=1`; it is not the production OTA path for the KLTN product story.

## Recently Completed - 2026-06-06 Production Readiness Gate

- Backend now has `npm run check:production` and `npm run check:production:strict` to report or block missing production setup.
- Web Admin Settings has a platform-only `Triển khai` tab backed by `/api/v1/settings/production-readiness`.
- `web-monitor\.env.example` now lists production placeholders for Firebase, public HTTPS backend URL, Postgres, S3/R2, PHI encryption, Brevo email API/SMTP fallback, SMS/Zalo webhook, MQTT, CORS, and rate limit.
- `SMART_HEALTH_THIRD_PARTY_SETUP.md` now lists the real third-party accounts/secrets the user must create before strict production smoke can pass.
- Current local/demo env correctly reports `BLOCKED`; this is expected until real provider credentials and deployment URLs are supplied.

## Recently Completed - 2026-06-07 Platform Admin Login Fix

- Fixed backend Firebase role normalization so custom claims `role=admin` or `role=platform_admin` resolve to backend `role=admin` before workspace-role normalization. This prevents real platform/system admin accounts from being shown as hospital Workspace Portal admins after Firebase login.
- Verified backend syntax/check with `npm.cmd run check`. After deploying this fix, the admin user should sign out and sign in again so Firebase issues a fresh ID token.
- Added and applied Supabase migrations for production RBAC persistence: `004_expand_user_roles.sql` expands persisted user roles for Workspace Portal accounts and `005_seed_default_organization.sql` creates `org_default_clinic`.
- Added `npm.cmd run smoke:production-roles`; it passed against the Render backend and verified platform admin vs workspace admin `/api/me` capabilities through real Firebase Auth.

## Recently Completed - 2026-06-07 Firebase Hosting Domains

- Reserved Firebase Hosting site `shcare` for the future user-facing web app: `https://shcare.web.app`.
- Deployed the current Web Admin to Firebase Hosting site `shcare-admin`: `https://shcare-admin.web.app`.
- Added Web Admin Firebase Hosting config (`.firebaserc`, `firebase.json`, `vite.firebase.config.ts`) and `npm.cmd run build:firebase`.
- Added multi-origin backend CORS support so Render can later use `CORS_ORIGIN=https://shcare-admin.web.app,https://shcare.web.app` instead of `*`.
- Chrome smoke passed on `shcare-admin.web.app`: Firebase login, `Platform Admin Console` role, clean console, and Render backend API calls returned 200. `shcare.web.app` returning 404 is expected until the future web app is implemented.
- Fixed the hosted Web Admin auth boundary: clean unauthenticated `/` now redirects to `/login`, an existing Firebase admin session opens dashboard directly, and logout signs out Firebase plus clears the stored backend token. `npm.cmd run build:firebase` passed and the fix was deployed to `https://shcare-admin.web.app`.
- Hardened Firebase Hosting cache headers for `shcare-admin` with `Cache-Control: no-cache, no-store, must-revalidate` after Brave showed an old admin shell bundle. Fresh Chrome smoke still redirects clean unauthenticated `/` to `/login`.

## Recently Completed - 2026-06-12 Web Surface Split

- Chosen and implemented the product split: `shcare-admin.web.app` = Platform Admin Console only; `shcare.web.app` = doctor/clinic/facility portal; Android = patients and doctors, no clinic-admin mode.
- Kept one backend/auth/data plane. `/api/me` now exposes `allowedSurfaces`, `defaultSurface`, and `currentWorkspace`; web login/layout uses those fields plus capabilities to block wrong-surface accounts with CTA to the correct domain.
- Added `/api/portal/*` semantic wrappers for portal patients, devices, scans/monitoring, staff/doctors, reports, notifications, audit, settings, and storage while keeping older routes compatible.
- Added separate Firebase Hosting build/deploy scripts for admin and portal, plus the `webapp` hosting target using `dist-firebase-portal/client`.
- Split Figma prompts: platform-admin prompt remains in `Figma_Admin_Web_Prompt.md`; portal prompt is now `Figma_Shcare_Web_Portal_Prompt.md` with required screens and prototype flows.
- Public deployment smoke now checks Render backend, `shcare-admin.web.app`, and `shcare.web.app` SPA rewrites after both surfaces are deployed.

Remaining web-split work:

- Run authenticated browser E2E for platform admin, doctor, solo doctor, and workspace admin on the two deployed domains.
- Continue moving any workspace-operational copy/components that still say "admin" into portal-specific wording.
- Add a dedicated GitHub Actions deploy workflow for `shcare.web.app` after Firebase secrets are configured.

## Recently Completed - 2026-06-08 CI/CD And Setup Runbook

- Added root GitHub Actions workflow `Smart Health CI` for backend check, workspace smoke, production readiness report, Web Admin Firebase build, Android debug compile, and ESP32-S3 normal/OTA firmware builds.
- Added manual GitHub Actions workflow `Deploy Web Admin` to build and deploy `shcare-admin` from GitHub once Firebase secrets are configured.
- Added Android `google-services.ci.json` so CI can compile debug without committing the real ignored Firebase Android config.
- Added `npm.cmd run smoke:public-deployment` to verify the current public Render backend and Firebase Hosting Web Admin without secrets.
- Added `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md`, a detailed Vietnamese runbook for the next setup session across GitHub Actions, Render, Supabase, Firebase Hosting, admin account creation, Brevo email/SMS/Zalo, Android, ESP first flash, and cloud OTA.
- Rewrote `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` with full Vietnamese accents and more explicit step-by-step instructions so it can be followed directly during the next setup session.
- Refined the platform-admin sidebar so it no longer shows the old default workspace scope text there; the sidebar now uses a shorter `Quản trị hệ thống` badge for platform admins.

## Recently Completed - 2026-06-09 Production Realtime Cleanup

- Production backend no longer auto-seeds demo users, organizations, devices, or notifications when `AUTH_MODE=production`.
- Device socket registration and scan start/recording now require an explicit device id in production; the old demo device fallback stays only for non-production use.
- Realtime browser listeners at `/listen` and `/app` accept `?token=` or `?access_token=` so the live monitor can use a real auth token instead of an anonymous stream.
- `/api/me` now returns `scopeType` and `scopeLabel`, which makes platform admin versus workspace/hospital context visible without reusing the old clinic footer text.
- `npm run check` and `npm run smoke:workspace-access` passed after the cleanup.
- Next practical slice: authenticated browser smoke for live audio, real platform-admin live-monitor session verification, and physical ESP32-S3 end-to-end smoke with the cloud audio/OTA path.

## Recently Completed - 2026-06-09 Android App Reality Pass

- Removed the most visible Android demo paths: fake `android-app` scan device id, hardcoded medical records, random/fake waveform confidence, OTP `123456`, and local-only notification toggles.
- New Scan and Live Monitoring now require real backend device selection; records/detail screens show real empty/error states instead of sample data.
- Profile/account flows now use real APIs: `/api/me` profile save, `/api/me/avatar` upload/delete/download, Firebase password reset, and Firebase password change.
- Added Firebase Cloud Messaging on Android: dependency, service, notification permission request, token registration after backend auth, refreshed-token registration, and backend `/notifications/register-device` integration.
- Notification preferences now persist through `/api/me.notificationPreferences`; backend normalization preserves the Android preference keys instead of discarding them.
- Verification passed: Android compile/build, backend syntax check, emulator install/launch, phone-login UI smoke, permission-prompt smoke, and Android demo/no-op string audit.

## Recently Completed - 2026-06-11 Skills And Android Signup Catalog UX

- Installed `mattpocock/skills` and added `SMART_HEALTH_AGENT_SKILLS_GUIDE.md` to avoid loading all skills by default. On 2026-06-22 the filtered current set was migrated from the embedded repo to the user-wide `C:\Users\baobe\.agents\skills` directory.
- Replaced the Android doctor-signup catalog no-op failure with a real empty/error/retry dialog. `Cơ sở y tế` and `Chuyên khoa` are now clickable even when backend catalog data cannot be loaded.
- Verified the fix with Android compile/build, emulator install/launch, doctor signup UI tree, specialty dialog smoke, clinic dialog smoke, and logcat scan.
- Remaining E2E gap: run the same doctor signup path against the deployed backend/Firebase with real clinic and specialty catalog rows, then submit a real doctor role request and approve it from Web Admin.

## Recently Completed - 2026-06-12 Doctor Request-Info Sync

- Backend request-info status now survives repository-backed mode: `roleInfoRequiredFields` is preserved through user claims, `/api/auth/firebase` reloads latest user state by Firebase UID/email, and the request creates a dedicated `doctor_info_requested` notification.
- Web Admin Doctor Approval now switches to the `needs_info` tab and updates the changed row immediately after a successful request-info action.
- Android pending-approval flow now refreshes status every 15 seconds and displays the admin request message plus required fields to the doctor.
- Verification passed: backend `npm.cmd run check`, Web Admin `npm.cmd run build`, Android `.\gradlew.bat :app:compileDebugKotlin`, Android `:app:installDebug`, emulator launch on `emulator-5554`, pending-screen UI tree dump, and crash-buffer scan with no app crash.
- Production deploy completed: commit `4e8548e` pushed to `origin/main`, Render backend served the new `/api/share-targets` auth behavior, Firebase Hosting Web Admin version `f13b8b22666bc3cd` released, and `npm.cmd run smoke:public-deployment` passed.
- Follow-up production bug was fixed after live API testing: request-info initially returned success but the list stayed pending because Postgres rejected empty-string timestamps and repository fallback hid the failed save. Commits `951c82c` and `7f1cdef` fixed guarded persistence and timestamp null handling; production verification now shows the affected doctor in `needs_info`, not `pending`.
- Follow-up resubmit bug fixed after Android polling reproduced the issue: app submit returned `pending`, then `/api/auth/firebase` pulled the SQL-backed `needs_info` state again. Backend now has guarded direct writes for doctor resubmit, approve, reject, and request-info; `npm.cmd test` covers the request-info/resubmit lifecycle locally.
- Follow-up registration reason fix: Android-submitted doctor signup `reason` is now persisted as `registrationReason` through repository-backed users, shown in Web Admin Doctor Approval, returned to Android/admin APIs, and included in platform-admin email metadata with a direct `/doctor-approval` CTA.
- Registration reason deploy completed on 2026-06-12: commit `4ce7915` pushed, Firebase Hosting Web Admin version `5124335308359eb3` released, public smoke passed, and production canary confirmed the exact submitted reason in auth, admin pending list, and notification metadata.
- Follow-up stale profile-field and solo-practice split fix: doctor resubmit now preserves updated phone/name/license/clinic/specialty/reason through backend repository mode and admin APIs. Android `Bác sĩ tư` registration now requires selecting or entering a private clinic name, stores that value, and sends `workspaceType=solo_practice`/`accountType=solo_doctor`; the needs-info form shows `Tên phòng khám tư` for solo doctors instead of forcing the hospital/facility catalog. Web Admin Doctor Approval displays `Bác sĩ tư` versus `Bác sĩ cơ sở`, maps `clinicSuggestion`, and admin email metadata translates account/workspace types to Vietnamese labels. Local verification passed: backend check/test, Android debug Kotlin compile, and Web Admin Firebase build.
- Stale-profile/solo-practice deploy completed on 2026-06-12: commit `72b0f3d` pushed, Firebase Hosting Web Admin version `7de2656be1036977` released, public smoke passed, and an authenticated Render canary confirmed doctor-request responses expose the new profile/type fields needed by Web Admin.
- Android needs-info UI follow-up: the request-info form no longer asks users to choose `Loại đăng ký` again. It uses the original backend `accountType`/`workspaceType`: private-doctor accounts get private-clinic fields and facility-doctor accounts get facility fields. The app also stops background polling while already in `needs_info`, preventing typed values from being reset during editing. Android compile and debug APK build passed.
- Android email verification follow-up: the app now reloads Firebase user state before splash routing, email verification checking, and resend. Generic "không thể kiểm tra xác thực email" is split into Firebase, token, backend, and role-request messages, and resend explains when the account is already verified instead of implying another email was sent. Android compile, debug APK build, install/launch smoke, and crash-buffer scan passed.
- Android auth UI spacing follow-up: the shared `VerificationBackButton` now uses status-bar-safe top spacing so the `Quay lại` control on verification/contact auth screens sits lower like the signup/forgot-password controls. Reviewed the other Android back headers; the remaining gradient/white headers already use a larger top offset or `statusBarsPadding`.
- Android doctor-login recovery follow-up: verified doctor accounts that still have a stored full pending registration but no backend doctor request now resubmit that request from `LoginScreen` instead of showing the misleading "not granted doctor" message. The old rejected-account path remains separate, so an actual admin rejection is not silently resubmitted.
- Backend doctor-login recovery follow-up: `/api/auth/role-request` now persists the selected workspace/private clinic before saving a repository-backed doctor request, fixing the new private-doctor account path that could fail and leave Android on a red "chưa gửi lại được hồ sơ" message. Android now parses backend error-object messages and re-checks auth status after role-request exceptions.
- Deployment verification: Render is serving commit `8a2c9a4`; public smoke passed and a temporary production canary proved new `solo_doctor` role requests enter the pending admin list, then cleaned itself up.
- Web Admin doctor account lock follow-up: backend lock now uses `accountStatus=locked` as the source of truth, disables linked Firebase Auth, revokes Firebase refresh tokens and backend sessions, and rejects locked users in auth/login guards. Unlock restores active doctor access and Firebase doctor claims. Local backend smoke now covers approve -> lock -> old session/login blocked -> unlock -> login restored.
- Doctor lock deployment completed on 2026-06-12: commit `320f519` pushed, Firebase Hosting Web Admin version `0cd9234ba6609f76` released, public smoke passed, and a production canary verified lock disables Firebase Auth and rejects the old doctor token, then unlock restores Firebase/backend doctor access and cleanup deletes the canary account.

Next practical backlog items:

- Install the new APK, then continue the real doctor Firebase account E2E: log in as the new verified private-doctor account, confirm the stored request is resubmitted to pending, admin sees the updated pending row, approves, and the doctor dashboard unlocks.
- Add browser-level Web Admin smoke for the same lifecycle; the backend API regression now exists in `npm.cmd test`.
- Ask the user to resubmit once from the real Android UI with the final human-written reason, then approve from Web Admin and confirm the doctor dashboard unlocks.

## Phase 0 - Context And Tooling Hygiene

Goal: make future chats efficient and safe.

Tasks:

- Keep these docs current after code/config changes:
  - `SMART_HEALTH_CONTEXT_NEW_CHAT.md`
  - `SMART_HEALTH_IMPLEMENTATION_STATUS.md`
  - `SMART_HEALTH_PRODUCTION_BACKLOG.md`
  - `SMART_HEALTH_COMMANDS_GUIDE.md`
- Before opening the next production-development slice, finish the remaining physical-device KLTN evidence gap in `SMART_HEALTH_KLTN_REPORT_COMPLETION_PLAN.md`. The 2026-06-05 report evidence gate now has build/smoke logs, web admin screenshots, Android emulator screenshots, audio WAV metadata/waveform, and a final Word copy, but still lacks a same-day ESP32-S3 serial monitor/upload capture because COM6/ESP32-S3 was not detected.
- Use CodeGraph for structure, Context7 for current docs, Chrome DevTools MCP for UI/browser verification.
- 2026-06-23 tooling completion, updated 2026-07-07: `codebase-memory-mcp` is configured and `smart-health-web` is indexed; Agent Reach, filtered Matt Pocock, Academic Research, context/token skills, `impeccable`, and 11/13 Taste skills are user-wide. Every future UI task must combine `impeccable` + `gpt-taste`, then load every materially applicable UI/UX skill from the registry pool. Taste v1/generic base remain skipped as direct duplicates.
- 2026-06-23 routing/token-gate completion: every future Smart Health task should map the request to the smallest relevant installed skill/tool before broad exploration. Apply lightweight `context-budget` + `strategic-compact` by default; load full ECC skill bodies for broad/long/tooling/audit/context-pressure work. The assistant should infer installed skills/tools from the registry without requiring the user to name them.
- 2026-06-23 organization audit: `C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md` is the single global registry. All remaining `.ai_skills` trees were removed, stale Antigravity instruction catalogs were converted to pointers, and no shared MCP/plugin/skill payload should be stored inside a repo going forward.
- Use the global `smart-health-project` Codex skill for project rules. The old project-local `.ai_skills` folder should not be recreated unless there is a strong reason.
- Use `SMART_HEALTH_AGENT_SKILLS_GUIDE.md` before choosing from the user-wide skill set. Do not load every installed skill by default; outside UI/UX, open only the smallest relevant skill set. For UI/UX, load the base pair plus every materially applicable UI/UX skill from the registry pool.
- New Smart Health chats should best-effort start claude-mem if it is not running.

Done when:

- New chat can read context docs and continue without full codebase scanning.
- Each completed code task leaves these docs in sync.
- KLTN report work can proceed from `D:\Study\KLTN\docs\PL2 (3)-IEEE references.final-evidence-20260605.docx` and `D:\Study\KLTN\docs\report-evidence\2026-06-05\SUMMARY.md` without rereading the full Word draft. Remaining KLTN evidence should focus on the real ESP32-S3 serial/audio end-to-end demo.

## Phase 1 - Backend Foundation And API Contract

Goal: make API behavior stable before larger UI/firmware changes.

Recently completed in JSON/demo path:

- Added workspace semantics on top of `organizations`: `workspaceType`, package/subscription fields, usage/quota summaries, and `/api/admin/workspaces` compatibility alias.
- Added default service packages for organization, solo practice, and personal/family segments.
- Added package update/delete and workspace package assignment endpoints.
- Extended role request handling so Android can create personal and solo-practice workspace flows while preserving existing facility-doctor approval.
- Fixed a local Firebase admin login blocker by repairing a stale JSON `firebaseUid` for `nguyengiabao100624@gmail.com` and making `/api/auth/firebase` update stale UID mappings when a verified token matches by email.
- Added first-pass backend capability enforcement for Workspace Portal roles on `/api/admin/*`, storage/signed URL/share/delete, exports, settings/AI, data delete, packages, workspace actions, doctor/staff actions, patients/family profiles, and selected-scan/profile sharing.
- Added `npm run smoke:workspace-access`, a real HTTP smoke test that logs in `platform_admin`, `workspace_admin`, `doctor`, `technician`, `billing`, and `viewer` and verifies cross-workspace and field-level role behavior.

Tasks:

- Standardize request context:
  - `requestId`
  - actor/user
  - organizationId
  - IP
  - user agent
- Standardize API error shape while keeping legacy `message` compatibility.
- Split backend gradually into route/service/repository modules.
- Finish repository foundation for:
  - users
  - organizations
  - memberships
  - patients
  - doctor_patient_access
  - devices
  - scan_sessions
  - audio_files
  - ai_results
  - notifications
  - audit_logs
  - storage buckets/files
- Update OpenAPI for current routes and `/api/v1` production routes.
- Promote workspace/package endpoints from JSON-compatible handlers into normalized repository/OpenAPI contracts.
- Add quota enforcement rules for doctors, patients, devices, storage, AI usage, and retention instead of only returning summaries.
- Add workspace-specific UI/API behavior in small slices: workspace type labels, personal/solo/facility filters, then a workspace switcher and dashboard specialization.
- Add personal health sharing contracts so personal/family users can share selected scans or records with a doctor/facility with expiry and audit.
- Keep package labels aligned with product semantics: `maxDevices` is activated/deployed devices; personal `maxPatients` is family/dependent health profiles; personal packages should not present `maxDoctors` as doctor seats.

Deliverables:

- `src/repositories/*.js`
- updated route/service modules
- current `public/openapi.yaml`
- migration/smoke scripts

## Phase 2 - PostgreSQL As Runtime Source Of Truth

Goal: stop treating normalized SQL tables as only a scaffold.

Tasks:

- Migrate JSON data to normalized PostgreSQL tables idempotently.
- Move runtime handlers off JSON arrays in this order:
  - auth/users/doctor requests
  - notifications/audit
  - organizations/memberships
  - patients/doctor access
  - devices/device events
  - scans/audio/AI
  - storage/export metadata
- Add safe fallback for `DATA_BACKEND=json`.
- Add smoke tests for Postgres mode.

Done when:

- `DATA_BACKEND=postgres` uses normalized tables for core app behavior.
- Running migration twice does not duplicate records.

## Phase 3 - Organization, Clinic, RBAC

Goal: make B2B clinic mode real.

Tasks:

- Enforce tenant isolation by `organizationId`.
- Implement admin APIs:
  - organizations CRUD
  - memberships CRUD
  - assign/revoke doctor-patient access
  - assign/revoke clinic-device access
- Enforce access for:
  - patients
  - scans
  - devices
  - storage files
  - exports
  - signed URLs
- Web admin pages consume real APIs:
  - Clinics
  - Doctors
  - Patients
  - Devices
- Android doctor sees only granted patients.

Done when:

- Cross-org access is blocked and returns standard error.
- Audit records are written for admin access changes.

## Phase 3B - Workspace Portal V1

Goal: let each clinic/hospital manage its own workspace without exposing platform-wide admin data.

Tasks:

- Continue hardening `/api/me` workspace context and capability contracts; JSON/demo mode returns memberships, `currentWorkspaceId`, and backend-derived capabilities, but the contract still needs OpenAPI coverage and production repository parity.
- Make the existing web admin role-aware:
  - Platform Admin Console for Smart Health internal operators.
  - Workspace Portal for clinic/hospital workspace admins.
- Continue rendering sidebar/menu/actions from capabilities instead of a single fixed admin menu. Sidebar capability filtering, topbar Platform/Workspace labeling, first-pass route-level blocking, and first-pass action/button/dialog gating have started across the major admin pages; remaining coverage is deeper per-dialog field behavior, row-level edge cases, and E2E tests under real platform/workspace/doctor/technician accounts.
- Patient list/detail/create/update/delete routes, device list/management routes, scan creation/start/stop/upload/complete mutations, storage/object downloads, storage share/delete/download, export list/create/download, package/workspace actions, doctor/staff actions, settings/AI updates, data delete, and access-log listing have started using capability/workspace scoping in JSON/demo mode. Cross-workspace/forbidden requests are blocked by backend and covered by `npm run smoke:workspace-access`. Continue applying the same pattern to repository-backed runtime, immutable audit, OpenAPI, and browser/device E2E.
- Add workspace-scoped portal pages or scoped variants for:
  - overview
  - staff/doctors
  - patients and family groups
  - devices
  - live monitoring
  - scans and AI
  - storage/reports
  - workspace settings
- Ensure workspace admins see only their workspace. Doctors see only assigned patient profiles and shared scans. Technicians can pair/assign devices and support measurements but cannot change billing/package settings.
- Expand Workspace Portal v1 UI beyond the overview entry points into dedicated scoped staff, patients/family groups, devices, live monitoring, storage/reports, and settings screens with route-level and dialog-level tests for every role.

Done when:

- Platform admin sees global workspaces/packages/devices/audit.
- Clinic/hospital admin sees only its workspace data.
- Doctor/staff roles have different visible menus and backend-enforced permissions.
- Cross-workspace access attempts return 403 and are audited.

## Phase 3C - Family Profiles And Sharing

Goal: support a real personal/family model without forcing every family member to create an account.

Tasks:

- Treat `patients` as patient profiles for personal/family use, or add a compatible profile layer if needed.
- Add profile metadata for relationship/dependent use cases.
- Require profile selection before starting a scan in personal/family flow. First Android slice is implemented in New Scan; continue polishing profile management and live-monitoring integration.
- Add access grants for sharing a workspace, one profile, or selected scans with a doctor/facility. First backend and Android scan/profile share slice is implemented; continue with share listing/revoke UX, expiry editing, consent screens, and audit views.
- Add expiry and audit records for share creation, access, revocation, and export.

Done when:

- One account can manage multiple family/dependent profiles.
- One device can measure multiple profiles without mixing records.
- A doctor/facility can be granted limited access to selected profiles/scans.

## Phase 4 - Doctor Lifecycle Hardening

Goal: make doctor registration and approval reliable.

Current 2026-05-26 status: JSON/demo mode now has backend hospital/clinic and specialty catalogs, full Android doctor role-request payload, persisted pending registration, searchable Android hospital selection with missing-facility request, Android `needs_info` resubmit, admin doctor delete that removes linked Firebase Auth users before backend data, and admin clinic edit/lock/unlock/delete actions wired to backend. Remaining work is E2E browser/device smoke, audit hardening, a complete real-world hospital dataset, and production DB normalization.

Tasks:

- Persist all doctor signup fields:
  - full name
  - phone
  - license number
  - clinic/organization
  - specialty
  - registration reason
- Add request-info flow:
  - admin selects fields that need correction
  - backend creates notification
  - Android pending screen shows request clearly
  - doctor can resubmit required data
- Ensure pending doctors cannot enter doctor dashboard before approval.
- Ensure approved doctors appear in Doctors management immediately.
- Lock/unlock updates menu labels and actual permissions.
- Keep destructive doctor lifecycle actions audited and synced with Firebase Auth, including delete/lock/unlock edge cases.

Done when:

- Signup -> verify email -> pending -> approve -> doctor dashboard works.
- Request-info and reject are visible in app with clear Vietnamese messages.

## Phase 5 - Notifications And FCM

Goal: make notification state and push delivery reliable.

Tasks:

- Canonical notification records stay in DB.
- Register Android FCM token in `notification_devices`. Android registration, server-side FCM delivery, bounded retry, and per-attempt failure tracking are implemented; continue with real device/provider delivery smoke.
- Add notification delivery fields:
  - channel
  - status
  - sentAt
  - failedAt
  - retryCount
  - errorMessage
- Add user preferences. First Android/backend save path completed on 2026-06-09; continue with provider-level delivery filtering.
- Add unread count API.
- Web admin topbar/dropdown/Notifications page use same source.
- Mark-read/delete/share/detail actions sync immediately.

Done when:

- Topbar badge, module badge, dropdown, and Notifications page stay consistent after mutations.
- No demo notifications flash before real data loads.

## Phase 6 - Storage And Exports

Goal: make storage admin, download, share, and file names production-like.

Tasks:

- Store bucket metadata:
  - name
  - description
  - iconKey
  - colorKey
  - category
  - quotaGb
  - visibility
  - allowedExtensions
  - allowedMimeTypes
  - maxFileSizeMb
  - retentionDays
  - encryptionRequired
  - system
  - createdAt/updatedAt
- Standard icon keys:
  - audio
  - waveform
  - image
  - dicom
  - report
  - document
  - firmware
  - avatar
  - ai
  - export
  - backup
  - audit
  - consent
  - video
  - database
- Implement storage APIs:
  - create bucket
  - delete empty custom bucket
  - upload file
  - delete file
  - share file
  - authenticated download
- Add signed URLs or authenticated fetch downloads.
- Standardize downloaded file names:
  - reports
  - exports
  - audio scans
  - storage files
  - notification reports
- Keep web export/report dialogs on live backend datasets; add smoke coverage for PDF, Excel, CSV, JSON, and SQL.
- Audit:
  - upload
  - delete
  - share
  - download
  - bucket create/delete

Done when:

- Upload/download/share/delete work against local storage and S3-compatible adapter.
- File names are meaningful and sanitized.
- No storage page demo data flashes during loading.

## Phase 7 - Audio Plane And Scan Lifecycle

Goal: convert demo recording into production scan lifecycle.

Target lifecycle:

```text
created -> recording -> uploading -> queued -> processing -> completed
created -> recording -> failed
queued -> processing -> failed
```

Tasks:

- Add production scan APIs:
  - `POST /api/v1/scans`
  - `POST /api/v1/scans/:scanId/audio-chunks`
  - `POST /api/v1/scans/:scanId/complete`
  - `GET /api/v1/scans/:scanId/audio-url`
- Keep legacy demo routes:
  - `/api/scans/start`
  - `/api/scans/:id/stop`
  - `/api/scans/:id/audio`
- Auth all production scan routes.
- Make scan start/stop idempotent.
- Store files under:

```text
org/{orgId}/patients/{patientId}/scans/{scanId}/audio.wav
org/{orgId}/patients/{patientId}/scans/{scanId}/waveform.json
```

Done when:

- Web/Android can track status instead of assuming completed immediately.
- Audio download no longer opens an unauthenticated tab that returns 401.

## Phase 8 - AI Worker Pipeline

Goal: decouple AI/audio processing from request handlers.

Tasks:

- Add Redis/BullMQ or local fallback worker.
- Worker performs:
  - WAV validation
  - duration/sample-rate check
  - clipping count
  - signal level
  - noise estimate
  - waveform JSON
  - AI placeholder/model adapter
  - `audio_files` write
  - `ai_results` write
- Add retry/failure history.
- Add model version and confidence fields.

Done when:

- Worker moves status `queued -> processing -> completed/failed`.
- Web admin "Lượt đo & AI" shows real processing history.

## Phase 9 - Device Provisioning And MQTT Control Plane

Goal: make physical devices manageable after sale.

Current 2026-06-06 status: a first cloud-first path exists. Firmware connects outbound to backend WebSocket/WSS, sends heartbeat/audio/events, receives commands, and performs cloud OTA by HTTPS URL/checksum. Backend records device telemetry/events, stores SHA-256 metadata for uploaded firmware, and can issue tokenized OTA firmware download URLs from `device-firmware`. Web Admin exposes cloud status, events, restart/revoke/rotate, and OTA command UI with firmware-file selection. Android consumes backend cloud device status. Local ESP portal is now WiFi recovery only.

Tasks:

- Firmware provisioning v1:
  - WiFi recovery portal exists for SSID/password only
  - add QR/claim-code pairing for device ownership
  - BLE later if needed
  - no hardcoded WiFi/IP in source
  - store WiFi/device secret in secure NVS
- QR contains only:
  - `deviceId`
  - `claimCode`
  - never raw device secret
- Backend device APIs:
  - create device batch
  - claim
  - revoke
  - unpair
  - transfer owner/clinic
  - rotate secret
  - push OTA metadata (cloud OTA command and storage-backed firmware release selection exist; signing/rollback still pending)
- MQTT topics:
  - `devices/{deviceId}/telemetry`
  - `devices/{deviceId}/commands`
  - `devices/{deviceId}/events`
  - `devices/{deviceId}/ota`
- Device events timeline:
  - connected
  - disconnected
  - heartbeat
  - revoked
  - secret rotated
  - OTA update
- Firmware release hardening:
  - upload/select `.bin` from `device-firmware` storage instead of manually pasting URL (implemented for web/backend; physical-board smoke pending)
  - verify SHA-256 checksum on-device
  - add signed firmware verification
  - replace demo HTTPS `setInsecure()` with trusted CA/cert handling
  - add rollback/failure recovery policy

Done when:

- Revoked devices cannot send accepted telemetry/audio.
- Rotate secret invalidates old credential.
- Device status cards use real heartbeat/device_events.
- OTA succeeds from Web Admin while ESP and operator laptop are on different networks with only Internet access.

## Phase 10 - Realtime Scaling

Goal: prepare for more than one backend instance.

Tasks:

- Auth WebSocket connections.
- Move presence/active recording state out of local memory.
- Use Redis pub/sub for:
  - device status
  - scan status
  - notifications
  - audio metrics
- Decide sticky sessions vs dedicated ingest service for realtime audio.

Done when:

- Backend restart/multi-instance does not lose critical scan state.

## Phase 11 - Security, Medical Data, And Compliance

Goal: reduce risk for health/PHI data.

Tasks:

- Rate limit auth, upload, scan start/stop, admin actions.
- Encrypt sensitive PHI fields where appropriate.
- Mask secrets in UI and logs.
- Add immutable/append-only audit strategy.
- Enforce and audit consent/shared-record expiry across portal, Android, patient-facing history, and repository-backed runtime. The 2026-07-09 portal grant UI already accepts optional expiry for workspace patient shares.
- Audit every export/download/signed URL.
- Add retention policies.
- Review CORS, headers, object storage ACLs, Firebase rules.

Done when:

- Admin can explain who accessed/exported/downloaded patient data and when.
- Secret/device credentials never appear in QR or client-visible payloads.

## Phase 12 - CI/CD, Monitoring, And Operations

Goal: make deployment and incident response repeatable.

Tasks:

- GitHub Actions baseline is now present:
  - backend check and workspace smoke
  - production readiness report
  - Web Admin Firebase build
  - Android debug compile
  - PlatformIO ESP32-S3 normal/OTA firmware build
  - manual Web Admin Firebase Hosting deploy once GitHub secrets are configured
- Remaining CI/CD hardening:
  - add frontend lint once current lint debt is cleaned
  - add Android release build/signing lane with secrets
  - add backend deploy verification against Render after auto-deploy
  - add firmware artifact upload for OTA releases
- Structured JSON logs with request IDs.
- `/metrics` Prometheus text.
- Alerts:
  - backend high error rate
  - AI job fail
  - storage near quota
  - device offline
  - queue stuck
- Backup/restore runbooks:
  - PostgreSQL
  - object storage
  - Firebase config/claims documentation

Done when:

- A new machine can build/test/deploy using docs without hidden steps.

## Immediate Recommended Next Sprint

1. Follow `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md`: verify GitHub Actions, add Firebase GitHub secrets if using Actions deploy, confirm Render env, deploy `shcare-admin`, and smoke login/admin-account creation.
2. After provider setup, run `npm.cmd run check:production:strict` with production-like env and fix every required failure before final deployment smoke.
3. Finish the remaining KLTN hardware evidence gap: real ESP32-S3 flash, serial monitor, cloud heartbeat, WSS audio, command delivery, and cloud OTA from Web Admin.
4. Verify current web admin storage/notification/doctor/account/settings flows against a real authenticated platform admin and workspace admin browser session.
5. Browser-smoke export/report downloads against a real authenticated backend session.
6. Finish authenticated download/signed URL behavior for scan audio and storage files.
7. Continue moving doctor/users/notifications/audit fully to repository layer. The doctor role-request write path now persists through the repository layer, but the rest of the auth/admin lifecycle still needs full smoke coverage.
8. Replace the current built-in hospital catalog with a maintained authoritative Vietnam facility dataset or admin import workflow; the demo catalog now covers many major TP.HCM hospitals/clinics but is not a legal/complete national registry.
9. Add FCM token registration skeleton.
10. Add scan lifecycle APIs beside existing demo scan routes.
11. Expand Android element-level micro-interactions after core route motion, focusing on repeated cards, list rows, loading states, and destructive confirmations.
12. Keep these docs updated after each completed change.

## 2026-06-05 Backlog Update - Admin Basic Functions

Completed in this slice:

- Replace browser confirm/alert in admin dangerous actions with shared modal/toast UI.
- Make Account Settings real enough for KLTN demo: profile save, readonly Firebase email, avatar upload/link removal, backend sessions and revoke flows.
- Make System Settings controlled and backend-backed: system, branding, notification, privacy, storage, stethoscope, AI, outbound, and security policy sections.
- Add Brevo email API/SMTP fallback test endpoint and SMS/Zalo webhook test endpoint without committing provider credentials.
- Disable unavailable production-only controls with visible reasons instead of leaving clickable no-op buttons.

Next practical backlog items:

- Configure real Brevo API env on Render Free, then send a real test email from Settings. SMTP/Gmail remains fallback only for local/paid hosts that allow SMTP.
- If SMS/Zalo demo is needed, provide a webhook receiver URL and test payload delivery; direct SpeedSMS/eSMS/VietGuys/Zalo OA/ZNS paid-provider integration stays later because there is no stable production-free SMS/Zalo channel.
- Add browser E2E scripts for account save/avatar/session revoke/settings save/delete modals under authenticated admin tokens.
- Continue repository/PostgreSQL parity for settings, sessions, audit, storage metadata, and notification preferences.
- Finish physical ESP32-S3 evidence once the board appears as a real COM port.

## 2026-06-06 Backlog Update - Admin Login Stabilization

Completed in this slice:

- Fixed the admin runtime mismatch that caused Firebase production login to fail against a demo-mode backend.
- Added frontend token cleanup on API `401` responses.
- Repaired real mojibake strings introduced in the admin basic-functions pages and one backend error message.
- Verified login page rendering, invalid-credential error behavior, backend production auth mode, web admin build, backend syntax check, no `window.confirm`/`alert`, and no remaining real admin-source mojibake hits.

Next practical backlog items:

- Test successful login with the real Firebase admin account and then smoke Account Settings, avatar upload, session revoke, Clinics/Packages/Storage delete dialogs, Settings save, and outbound test buttons in an authenticated browser session.
- Add a small authenticated Playwright/Chrome smoke script once an admin test token or test account workflow is available.
- Configure Brevo API env on Render Free and optional SMS/Zalo webhook/provider env, then run real outbound delivery tests.
- Keep physical ESP32-S3 serial/upload evidence as the next hardware step when the board is connected.

## 2026-06-06 Backlog Update - Clinic Delete Clarity

Completed in this slice:

- Fixed doctor/workspace count mismatch for clinic usage and delete modal.
- Added structured backend details for blocked clinic deletion.
- Updated clinic delete modal/toast to show linked accounts, doctors, patients, and devices separately.

Next practical backlog items:

- Add an admin transfer/reassign workflow so users, patients, and devices can be moved from one workspace to another before deleting a clinic.
- Add authenticated browser smoke for the clinic delete modal once a reusable admin test session exists.

## 2026-06-06 Backlog Update - Workspace Admin Separation

Completed in this slice:

- Created a real Firebase-backed workspace admin smoke account for `Bệnh viện Demo Workspace`.
- Added a repeatable backend script to create/update the Firebase user, custom claims, JSON organization, membership, and seeded workspace doctor/patient/device.
- Made web admin visibly distinguish platform admin vs hospital admin through sidebar/topbar/dropdown badges.
- Hid and route-blocked platform-only surfaces from workspace admin: global packages, clinic/workspace management, doctor approval, and Firebase sync.
- Scoped settings GET/PATCH so workspace admins edit hospital settings, not global platform settings.
- Verified API and browser smoke for scoped clinics/doctors/patients/devices/storage/settings and platform-denied routes.
- 2026-06-08: Added the platform-admin UI workflow to create admin accounts without terminal scripts. `POST /api/admin/admin-users` creates Firebase Auth users, sets admin/workspace-admin claims, saves backend user/membership through repositories, rejects duplicate email, and audits the action.

Next practical backlog items:

- Rotate or recreate the local workspace-admin demo password before sharing outside the local KLTN machine.
- Add automated browser E2E for platform admin vs workspace admin navigation and direct-route denial.
- Add CRUD smoke for workspace admin creating/editing doctors, patients, devices, storage files, notifications, and settings inside only its own hospital.
- Port or retire the legacy Firebase workspace-admin seed script if it is still needed outside local smoke; the Web Admin endpoint already uses repository saves for production account creation.

## 2026-06-06 Backlog Update - Settings/Account Demo Functions

Completed in this slice:

- Unlocked Account Settings demo actions: profile notification preferences, app/SMS 2FA state, recovery codes, avatar upload/link/clear, sessions, revoke session, and logout-all-other-devices.
- Unlocked System Settings demo actions: logo upload/link/clear, scoped backup check, workspace API key create/rotate/revoke, and local-demo AI model metadata update.
- Fixed workspace settings logic so hospital admins do not see platform API keys inherited from global settings.
- Verified avatar/logo backend upload path through authenticated storage upload and image download; the earlier “không BE” symptom is addressed by the storage upload route plus running backend in Firebase production mode.

Next practical backlog items:

- Add real TOTP/SMS OTP verification if 2FA must be security-complete beyond the KLTN demo state.
- Add production API gateway/key enforcement instead of only storing masked key metadata in settings.
- Add real backup restore/runbook for PostgreSQL/object storage; current backup check is a scoped JSON/local-storage health check.
- Move AI update from metadata-only local-demo to a worker/model registry pipeline when the AI backend is productionized.
- Add an automated authenticated browser E2E script that uploads avatar/logo with a generated test image and asserts Account/Settings toast success.

## 2026-06-06 Backlog Update - KLTN Product-Readiness Hardening

Completed in this slice:

- Firmware runtime configuration is now report-ready for moving between networks: ESP32-S3 reads saved WiFi config from NVS and opens `SmartHealth-<suffix>` at `http://192.168.4.1` for WiFi recovery only when reconnect is required.
- Firmware no longer hangs silently on missing WiFi/backend build flags, WiFi connection failure, or backend DNS failure.
- Android release builds now require a non-local HTTPS backend URL and fail fast if someone tries to package a release APK that still points at emulator/localhost.
- Web admin product builds now require production auth mode and non-local HTTPS backend URLs through `npm run build:product`; local backend URLs are blocked unless explicitly allowed for internal testing.
- Full compile/build smoke passed across backend, workspace access, web admin, Android debug/release, and firmware.

Next practical backlog items:

- Connect the ESP32-S3 board and capture real flash + serial-monitor evidence for setup portal, WiFi connection, UDP target, waveform stream, and one saved scan.
- Deploy or expose the backend through a real HTTPS domain, then rebuild Android release with `-PSMART_HEALTH_BASE_URL=https://<real-api-domain>`.
- Decide the KLTN demo data backend for presentation day: JSON local product-demo mode is verified; PostgreSQL/object storage mode needs final credentials and smoke if required by the committee.
- Configure real Brevo API or SMTP fallback env and optional SMS/Zalo webhook env only on the deployment/demo machine, then run real outbound tests from Settings.
- Add release signing credentials for Android outside source control before distributing the APK.
- Keep future-direction work blocked until the KLTN-critical real demo path is fully captured with web admin, Android, firmware, and evidence screenshots/logs.

## 2026-06-06 Backlog Update - Cloud Device Control And OTA

Completed in this slice:

- Superseded the earlier local-device-admin direction: `smarthealth-xxxxxx.local/admin`, browser `.bin` upload on the ESP, OTA password editing, backend host editing, and local restart/admin controls are not the product management path.
- ESP32-S3 now opens AP `SmartHealth-<suffix>` at `http://192.168.4.1` only when WiFi is missing or cannot connect. The local portal only saves SSID/password.
- ESP32-S3 now connects outbound to backend WebSocket/WSS, sends heartbeat telemetry and audio frames, receives cloud commands, and handles cloud OTA download/verify/install/reboot.
- Backend now stores heartbeat/device events and exposes cloud command, OTA, and device-event APIs for the Web Admin.
- Web Admin Devices page now shows cloud online/offline, WiFi/IP/RSSI, firmware/audio/OTA status, latest command, event history, WiFi recovery instructions, and cloud OTA form.
- Verified backend check, workspace smoke, web admin build, and both default/OTA firmware environments compile cleanly.

Next practical backlog items:

- First wired flash when the board is available, then compile with the backend host/device id/device secret flags and capture serial evidence for cloud heartbeat, WSS audio, and cloud command delivery.
- Upload or host a `.bin`, compute SHA-256, send OTA from Web Admin, and capture on-device OTA progress/reboot evidence while the laptop and ESP are not necessarily on the same WiFi network.
- Browser-smoke the firmware selector with a real platform/workspace account after uploading a `.bin`, then run the OTA on a physical ESP32-S3 and capture progress/reboot evidence.
- Harden security: QR claim-code provisioning, secure NVS/device secret lifecycle, mandatory device secret/certificate validation, trusted CA/cert handling, signed firmware, and rollback.
- Add battery telemetry only after the battery circuit/ADC divider/charging module is fixed in hardware, so firmware does not fake unsupported battery data.

## 2026-06-08 Backlog Update - Admin Account Management And Account Security

Completed in this slice:

- Added the `/admin-accounts` Web Admin page for platform admins to manage admin accounts from the UI instead of relying on terminal scripts.
- Completed backend admin-account operations for list, update, lock/unlock, reset password, and delete, with Firebase Admin sync where configured and audit records for dangerous actions.
- Fixed Account Settings avatar changes by moving profile avatar upload/download/delete to dedicated `/api/me/avatar` endpoints that do not require broad storage-admin permission.
- Fixed Account Settings password changes for production Firebase users by re-authenticating in Firebase Web Auth, updating the Firebase password, and then recording the change in backend audit/settings.
- Fixed self-edit logic so saving name/title/phone for the current platform admin no longer fails as a self role/workspace change.

Next practical backlog items:

- Browser-smoke `/admin-accounts` with a real platform-admin session: create a workspace admin, lock/unlock it, reset password, then delete it.
- Browser-smoke Account Settings avatar upload/remove and password change against the deployed `shcare-admin` + Render backend.
- Add automated E2E coverage for admin-account lifecycle once test credentials are stable in CI secrets.

## 2026-06-08 Backlog Update - Avatar, Password Reset, And Font Cleanup

Completed in this slice:

- Removed the remaining visible Storage mojibake labels in admin runtime source.
- Normalized no-accent backend permission/error messages in `server.js` for the account/admin/storage/workspace/settings/export/sharing flows that surface in toast/modal responses.
- Replaced Forgot Password frontend-only simulation with Firebase `sendPasswordResetEmail`.
- Added correct user-facing handling for Firebase `auth/unauthorized-domain` and `auth/unauthorized-continue-uri`, so missing Firebase authorized-domain setup no longer appears as an expired login session.
- Hardened `/api/me/avatar` for Supabase/S3 production storage by allowing the upload filename header, sending S3 `ContentLength`, persisting avatar object metadata in the user profile, serving avatar bytes through the backend, and cleaning up old avatar objects.
- Scoped password-change notifications to the current user and fixed their Vietnamese copy.
- Added Brevo API as the preferred Render Free email path while keeping Gmail SMTP fallback error handling for invalid App Password, missing App Password, From/Sender mismatch, or SMTP timeout.

Next practical backlog items:

- Push and redeploy Render + Firebase Hosting before re-testing `https://shcare-admin.web.app`; the deployed stack will not change until redeploy.
- In Firebase Console, verify Email/Password sign-in is enabled and `shcare-admin.web.app` is an authorized domain, then test `/forgot-password` with a real admin email.
- In Render, set Brevo email env (`EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`) and verify the Brevo sender email is approved; then retest Settings > Test email.
- Browser-smoke Account Settings avatar upload/remove and password change on the deployed site using a real platform-admin account.

## 2026-06-08 Backlog Update - Platform Admin Notification Email Fanout

Completed in this slice:

- All backend-created Web Admin notifications now queue a branded HTML email to active platform/system admin emails.
- The email template includes Smart Health branding, notification severity, full message, timestamp, workspace/user scope, sanitized metadata, and a CTA to `WEB_ADMIN_URL/notifications`.
- Delivery reuses Brevo API over HTTPS as the Render Free path and SMTP/Gmail only as fallback.
- Added `NOTIFICATION_EMAIL_ENABLED` as an emergency disable switch and `WEB_ADMIN_URL` for the notification CTA.

Next practical backlog items:

- Set/verify Render env `WEB_ADMIN_URL=https://shcare-admin.web.app`, `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, and optional `BREVO_FROM_NAME`, then create a Web Admin notification and confirm all platform admin inboxes receive the email.
- For push notifications, per-attempt delivery history/retry status is now implemented in `pushAttempts`; email fanout still needs a separate per-recipient delivery ledger if workspace/hospital admin email policy expands beyond platform admins.
- Decide a workspace/hospital admin email policy later: which notification types should go to hospital admins, doctors, technicians, and patients, and how to respect notification preferences.
- Keep SMS/Zalo direct provider integration in future development unless a real provider account/token is supplied; free/demo remains webhook relay only.

## 2026-06-12 Backlog Update - Android Core MVP

Completed in this slice:

- Android debug APK default backend is now the public Render API instead of the stopped local emulator backend.
- Startup now has backend health preflight, Firebase ID-token refresh, backend `/api/auth/firebase` session restore, and role/status routing.
- Notification permission prompt was moved out of cold launch and into Notification Settings after an explicit user action.
- Android core screens no longer show the visible SMS login button, fake personal placeholders, the hardcoded doctor greeting, raw share target IDs, or technical `backend cloud` wording.
- Backend and Android now support share-target discovery through `GET /api/share-targets?q=` and a searchable Medical Records share picker.
- Android CodeGraph was initialized locally for this repo to speed future structural navigation.

Next practical backlog items:

- Use a verified Firebase smoke account to QA real Android flows end to end: login/session restore, dashboards, profile/avatar, device list/pairing, new scan, live monitor, records/detail, share picker, notification settings, and logout.
- Redeploy the Render backend after merging if the public deployment should expose `/api/share-targets` immediately.
- Add automated Android instrumentation or UI smoke coverage around splash routing, no startup notification permission dialog, signup catalogs, and records share picker.
- Keep SMS login hidden until a real SMS/Zalo provider account and backend verification flow are available.
- Complete physical ESP32-S3 heartbeat/audio/OTA evidence separately from the Android Core MVP.

## 2026-06-12 Backlog Update - Doctor Request-Info Sync

Completed in this slice:

- Backend repository/user lookup now keeps doctor request-info state fresh for Android session restore and pending-screen refresh.
- Web Admin Doctor Approval immediately moves request-info rows to `needs_info` after success and then reloads backend data.
- Android pending approval screen now polls for admin status changes and shows the admin message plus required fields.
- Emulator smoke installed/launched the debug APK and confirmed the doctor pending screen renders without crash.
- Render backend and Firebase Hosting Web Admin were redeployed on 2026-06-12; public deployment smoke passed afterward.
- Live production recheck found and fixed the SQL persistence bug: empty strings in timestamp columns caused hidden Postgres save failures. After commit `7f1cdef` deployed, the affected doctor account is visible in `needs_info` and the doctor auth endpoint returns the admin request.
- Android resubmit recheck then found the inverse stale-state bug: `/api/auth/role-request` returned `pending` before SQL persistence was confirmed, so polling returned `needs_info` again. Backend now verifies resubmit/approve/reject/request-info state transitions through direct repository updates, and `npm.cmd test` includes a lifecycle regression.

Next practical backlog items:

- Run the deployed real doctor-account E2E loop through request-info, doctor resubmit, admin approval, and doctor dashboard unlock.
- Add browser-level Doctor Approval smoke once the admin module is easier to test; backend API coverage for this transition is now present.

## 2026-06-24 Web UI Follow-up

Completed in this local UI slice:

- The public header stays above content while scrolling and changes from transparent to translucent only after scroll; desktop dropdowns remain open while a user enters a child link.
- The homepage now carries more operational context through its cinematic hero, proof cards, and handoff panel. Auth fits 1440px desktop and 500px mobile without horizontal overflow.
- Targeted lint/build and Chrome desktop/mobile light/dark QA passed.

Next practical backlog item:

- Keep authenticated portal visual QA separate: the local browser pass ran without `web-monitor`, so `/api/me` was intentionally unavailable.

## 2026-06-24 Public Web Visual Release

Completed in this release:

- Replaced the home hero surface with the local doctor video, removed the opaque color wash, and switched to masked edge-only blur so the central doctor/child area stays clear.
- Made top-of-page header transparency and no-blur state deterministic; retained the low-opacity, 44px water-glass surface only after scrolling.
- Added actual viewport and scroll-timeline reveal choreography across the public marketing pages while preserving `prefers-reduced-motion` support.
- Released Firebase Hosting site `shcare`, version `7bafbc088d49e939`, at `https://shcare.web.app`.

Remaining practical UI work:

- Còn chưa làm / tiếp tục: run a real user visual review of the published public pages at desktop and phone breakpoints, then tune copy/media crop only from concrete feedback. The platform correctly respects device-level reduced-motion, so systems that enable it intentionally do not show animated reveals.
- Keep bundle optimization separate from visual fidelity: the Firebase client chunk is still above the 500kB warning threshold and should be split after the visual baseline is accepted.

## 2026-06-25 Web UI Fit/Motion Follow-up

Completed locally in this slice:

- Made desktop scroll reveals more visible by keeping public reveal targets observed and re-toggling `pending`/`visible` when elements enter or leave the viewport.
- Updated the homepage reveal choreography to re-run on viewport entry with longer easing.
- Removed the boxy hero trust-chip background treatment and replaced it with inline trust markers.
- Added final CSS overrides for a non-purple teal/clinical palette, lower-opacity scrolled header glass, a clearer hero preview HUD, stronger desktop reveal offsets, smaller mobile reveal offsets, and tighter mobile hero/auth/preview fit.
- Local verification passed: Prettier, targeted ESLint, `bun run build`, and `bun run build:firebase`.

Remaining practical UI/deploy work:

- Superseded by the 2026-06-30 follow-up below: Firebase deploy completed and live smoke confirmed the newer assets.
- Bundle optimization was completed later on 2026-06-30 by route/page lazy splitting; keep only follow-up performance/Lighthouse tuning in backlog.

## 2026-06-30 Web UI Mobile/Motion/Scroll Release

Completed in this slice:

- Fixed the phone proof-card layout regression where cards were squeezed by leftover desktop grid spans.
- Reset scroll position on route changes across public, auth, and portal layouts.
- Reworked homepage reveal motion to use explicit DOM state and CSS so desktop scroll animation is visible and mobile animation does not shift cards horizontally off-screen.
- Hardened light/dark contrast for public/auth/portal text, inputs, and placeholders.
- Added portal backend status wiring through `/api/portal/status` and a compact portal topbar status pill.
- Built and deployed Firebase Hosting `webapp -> shcare`: version `cc264fa1be69d04a`, release `1782759036395000`, URL `https://shcare.web.app`.
- Live smoke confirmed `/`, `/login`, latest CSS/JS assets, mobile card fit, and Render API health.

Next practical backlog items:

- Run authenticated portal E2E with real doctor/clinic/workspace accounts: login, wrong-surface guard, patient/device/scan/report/storage/notification actions, error states, logout/session recovery.
- Load production envs and rerun `npm.cmd run check:production:strict`; current local shell still lacks Firebase Admin, public backend URL, Postgres, S3/R2, PHI encryption, email/SMS provider, Redis/MQTT, and firmware-signing envs.
- Run Lighthouse/browser performance regression on the split bundle and tune media/font delivery if needed.

## 2026-07-01 Production Backlog Update - Strict Env Gate And Live E2E

Completed in this slice:

- Live authenticated portal E2E passed for existing Firebase role accounts: workspace/facility smoke and doctor canary. Coverage was read-only: Firebase sign-in, backend Firebase auth, `/api/me`, portal status, overview, patients, devices, scans, notifications, reports, and audit log.
- Public web hero seam was fixed and deployed to `shcare.web.app`; top of home remains dark, while the dark-to-light transition now uses a gradient/progress bridge instead of a hard boundary.
- Backend route-contract fix was deployed through commit `409a3592`; live smoke confirmed Render/Firebase Hosting reachability, production role auth, and doctor view-only access to device event history.
- Backend production tooling commit `71a38f3e` was pushed after the route fix; live public and production-role smoke still passed.

Still blocking true production backend:

- Verify Render/backend host envs with real production providers, then rerun `npm.cmd run check:production:strict` from an environment that actually has those secrets loaded.
- Automatic env push was not possible from the current workspace because there is no Render API key, service id, Render CLI, or render config available.
- Required core envs: `AUTH_MODE=production`, `FIREBASE_AUTH_ENABLED=true`, `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`, `PUBLIC_BACKEND_URL`/`SMART_HEALTH_PUBLIC_URL`/`PUBLIC_API_BASE_URL`, `DATA_BACKEND=postgres`, `DATABASE_URL`, `OBJECT_STORAGE_PROVIDER=s3`, object bucket/endpoint/region/access keys, and `PHI_ENCRYPTION_KEY`.
- Important follow-ups: restrict `CORS_ORIGIN`, configure Brevo/email, choose SMS/Zalo webhook, add Redis for multi-instance queues, add MQTT if needed, and harden firmware signing/rollback.

## 2026-07-07 Codex Telegram Bridge Local Ops Follow-up

Source changes implemented locally:

- Account switching/default-account/quota-sync behavior was fixed in `codex-telegram-bridge`.
- Worker supports `WORKER_CONCURRENCY` for parallel jobs across different sessions while keeping same-session resume jobs serialized.
- Completion notifications for jobs and standalone sessions now include task name, request summary, Session ID, Task ID when available, start/end/duration, final status, result summary, detected file/output references, and account/profile details.
- `job_done` without a persisted final assistant answer is reported as `Failed`, not `Success`; failed and cancelled jobs use the same terminal-notification path with clear reason/status context.
- Notification spam guards now suppress duplicate running/completion messages through job markers and content-hash session final markers.
- Local verification passed for notification concurrency/dedupe/failure cases with the bridge API/DB/Telegram-client path, plus typecheck, full tests, and build.

Remaining ops:

- Keep this bridge item IN PROGRESS until a real Codex profile returns a `token_count` quota snapshot after switching. The 2026-07-07 copied-live-DB smoke verified manual switching, exhausted-account fallback, active/default display, and restart persistence on port `8798`, but real quota refresh was blocked by out-of-credit/usage-limit responses or no `token_count` event from the tested profiles.
- Restart the local bridge worker/server with `npm run windows:restart` only after active Telegram-launched Codex jobs finish, so the live process loads the rebuilt `dist` without interrupting a running task.
- Notification hardening is source-complete and locally verified; the restart step is only needed to put the rebuilt bridge into the live local process.
- This is local automation infrastructure, not a Smart Health production blocker.
