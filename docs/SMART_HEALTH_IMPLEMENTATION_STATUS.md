# Smart Health - Implementation Status

Last updated: 2026-07-02

This file records the real project state. Keep it factual: implemented, partial, scaffold, or not done. Update this file after every meaningful Smart Health code/config change so future new chats can avoid re-reading the whole codebase and reduce quota/token usage.

## Status Legend

- Real: implemented and used by runtime.
- Partial: some real integration exists, but important paths still use mock/demo/scaffold logic.
- Scaffold: structure exists but is not the primary runtime path.
- Not done: planned only.

## Summary Matrix

| Area | Status | Current reality |
| --- | --- | --- |
| Firebase Auth | Real/partial | Android, web admin, and Shcare Portal use Firebase. Backend verifies Firebase ID tokens and now syncs trusted custom claims for platform, workspace, and doctor portal roles into backend role/surface context. Shcare Web registration now uses backend-generated Firebase email verification links delivered through the outbound email provider instead of treating client-side Firebase request acceptance as inbox delivery. Claims/session refresh UX still needs hardening. |
| Doctor registration and approval | Real/partial | Android doctor registration verifies email and sends role request with persisted pending metadata, searchable hospital/clinic catalog selection, missing-hospital request, specialty, license, phone, name, and reason. If backend catalog loading fails or returns empty, the clinic/specialty fields still open with an error/empty-state dialog and retry action instead of becoming dead buttons. Web admin can list/approve/reject/request-info/delete; the approve modal uses a searchable clinic picker backed by the clinic catalog. Backend exposes clinic/specialty catalogs, persists structured request-info fields, and deletes linked Firebase Auth users before deleting doctor backend data. 2026-06-12 request-info sync fix: repository-backed users now preserve required fields, `/api/auth/firebase` reloads by Firebase UID/email, Web Admin immediately moves successful request-info rows to `needs_info`, and Android polls/displays admin info requests. Pending/dashboard route edge cases should still be E2E-tested. |
| Backend API foundation | Partial | Request/error/audit/repository foundations were started. Legacy routes still exist and must remain compatible. |
| Backend persistence | Partial | JSON mode works for demo. PostgreSQL schema and repository foundation exist, but not every runtime handler uses normalized tables yet. |
| Workspace/Organization/RBAC | Partial | `organizations` is now treated as workspace source of truth in JSON mode, with `workspaceType` (`hospital`, `clinic`, `solo_practice`, `personal`), subscription/package fields, usage/quota summary, `/api/admin/workspaces` alias, and package assignment endpoint. `/api/me` returns workspace context, `currentWorkspace`, backend-derived capabilities, `allowedSurfaces`, and `defaultSurface` for role-aware UI/domain gating. `/api/portal/*` semantic routes now expose portal patients/devices/scans/monitoring/staff/reports/storage wrappers while legacy routes remain compatible. Firebase custom claim `doctor` now self-heals backend user/membership/surface drift and materializes catalog workspaces such as `vn_hospital_quan_y_175`. Patients/family profiles, devices, scans, storage/signed URLs, exports, packages, workspace CRUD, doctor/staff actions, settings/AI updates, data delete, and sharing have first-pass backend enforcement and workspace scoping in JSON/demo mode. `npm run smoke:workspace-access` verifies six roles and cross-workspace failures; `npm run smoke:production-roles` verifies platform admin, workspace admin, and doctor portal surfaces against live Firebase/Render. Repository-backed parity and complete OpenAPI coverage are still pending. |
| Service packages and billing | Partial | Backend service packages are real JSON data with segment, quota, CRUD update/delete, default clinic/solo/personal packages, and workspace package assignment. Web admin Packages page reads backend data and now labels device quota as activated devices; personal package patient quota is presented as family profiles, not one device per patient. Payment provider, invoices, and quota enforcement are not done. |
| Web admin and portal UI | Partial production | The same web codebase now builds two surfaces: admin mode for `shcare-admin.web.app` and portal mode for `shcare.web.app`. Admin mode keeps platform-only navigation/guard for Platform Admin Console; doctor/clinic accounts are blocked with CTA to `shcare.web.app`. Portal mode shows doctor/clinic workspace navigation for patients, devices, scans/monitoring, staff, storage, notifications, audit, and workspace settings; platform admins are directed back to `shcare-admin.web.app`. Shcare Portal login now reports distinct denial reasons for admin, Android-only/patient, pending, needs-info, rejected, and portal-denied accounts instead of sending every non-portal user to the admin domain. Firebase Hosting has separate `admin` and `webapp` targets and build scripts. Full browser E2E for every portal flow remains pending. |
| Storage admin | Partial | Storage API/work has been planned and partly implemented. Verify current backend routes before relying on upload/share/delete/download as production-ready. |
| Notifications | Partial | Notification list/read/delete works in app/admin/portal. Android now registers FCM tokens to backend notification devices and saves per-user notification preferences. 2026-07-01 source fix removed a misplaced device-management assertion that could break single-notification delete. Actual Firebase Admin push delivery, retry, and failure tracking are still incomplete. |
| Android motion/animation | Real | Shared Compose motion layer is applied through `AppNavGraph.kt`, giving all routes consistent fade/slide/scale screen transitions. Element-level micro-interactions can still be expanded screen by screen later. |
| Android workspace onboarding | Partial | Signup now distinguishes personal user, solo doctor, and doctor belonging to a health facility. Solo doctor sends `workspaceType=solo_practice`; personal user sends `workspaceType=personal`; facility doctor still uses searchable clinic catalog plus specialty and optional missing-clinic request. Android New Scan now lists/creates family/dependent patient profiles and sends the selected `patientId` before starting a scan. Medical Records has a first share action for a scan/profile to a doctor/workspace. Full workspace switcher, dashboard-by-workspace, and polished family management screens are not complete. |
| Device management | Partial cloud-first | Device inventory and UI exist. `/api/devices` list and management actions are scoped by workspace/capability in JSON/demo mode. Backend now accepts outbound ESP WebSocket registration, heartbeat telemetry, device events, command delivery, event history, manual URL OTA, and storage-backed OTA command creation with tokenized firmware download URLs. 2026-07-01 source fix wires `GET /api/v1/devices/:id/events` in the device route and tests own/cross-workspace access. Production mode no longer auto-seeds demo devices or accepts missing device ids for scan/recording flow. Web Admin Devices page shows cloud status/events and sends restart/revoke/rotate/OTA through backend. MQTT/certificate hardening and physical-board E2E remain pending. |
| Audio ingest | Partial cloud-first | Legacy MSM261 UDP audio remains as development fallback. MSM261 firmware now attempts outbound WebSocket/WSS audio streaming to backend first, while backend fans ESP audio to listener clients. Android sends the current bearer token on the live WebSocket request. Backend listener sockets now support token-based auth in production, but TLS hardening, buffering, and durable HTTPS chunk upload remain pending. |
| AI pipeline | Demo/scaffold | Scan stop can produce local audio/quality-style result. No real queue/model pipeline yet. |
| Object storage | Scaffold/partial | MinIO/S3 direction is chosen. Local storage fallback remains important. Signed URL and quota/retention need verification/completion. |
| Firmware production | Partial cloud-first | `MSM261S4030H0` is the only active production firmware target. ESP32 code avoids committed secrets, has WiFi recovery AP, outbound backend WebSocket telemetry/audio, backend command handling, and HTTPS cloud OTA with SHA-256 verification. MSM261 builds normal/OTA firmware. INMP441 is retired from the current product scope. LAN ArduinoOTA is dev-only and disabled by default. Secure NVS/certificate provisioning, signed firmware, rollback, buffering, and real-board validation remain pending. |
| CI/CD and monitoring | Partial | GitHub Actions now checks backend, workspace access smoke, production readiness report, Web Admin Firebase build, Android debug compile, and ESP32-S3 normal/OTA firmware builds. A manual Web Admin Firebase Hosting deploy workflow exists for `shcare-admin` once GitHub secrets are configured. Metrics, alerts, backups, and full release automation are still pending. |
| Production readiness gate | Real/checker | Backend has a readiness CLI, strict deploy gate, platform-only readiness API, Web Admin deployment tab, production env example, and third-party setup runbook. The current local/demo env is intentionally blocked until real Firebase/Postgres/S3/HTTPS/secret setup is supplied. |
| Context/new-chat handoff | Real | Context docs and AI skill docs exist. Third-party skills are user-wide under `C:\Users\baobe\.agents\skills`; project-local skill copies were removed on 2026-06-22. `SMART_HEALTH_AGENT_SKILLS_GUIDE.md` documents selective routing, automatic installed skill/tool selection, and the every-task `context-budget` + `strategic-compact` token gate. KLTN report evidence summary, report-ready Word copy, and final evidence Word copy were added on 2026-06-05. |

## Product Direction

## 2026-06-24 — Shcare Portal release and UI quality pass

- `smart-health-web` public surfaces (`/`, `/san-pham`, `/bang-gia`, `/lien-he`) and workspace auth surfaces (`/login`, `/register`, `/register/phong-kham`) were redesigned first with a clinical base system, then upgraded to the `Signal Horizon` visual layer in `src/web-styles/signal-horizon.css`. The final direction intentionally uses the supplied style references plus live Origin/Mercury/dope.security/GIC cues: floating pill navigation, cinematic atmospheric hero, frosted product cards, violet-blue-cyan gradients, glass surfaces, and richer CSS motion. The copy avoids invented clinical outcomes, named providers, and fake activity metrics.
- SEO metadata, explicit form labels/names, and browser autocomplete were added or tightened. The public/auth routes were checked in light and dark mode, including a 390px mobile viewport: no horizontal overflow, broken images, or `href="#"` links were found. The final live home page had no console messages.
- Local QA after the Signal Horizon update covered desktop, tablet, and mobile public/auth pages in Chrome DevTools. `bunx eslint` passed on the changed TSX files after Prettier. `bun run build` passed; Vite still reports the existing JavaScript chunk-size warning (>500 kB), which should be addressed with route/component code splitting rather than hidden.
- Firebase Hosting `webapp -> shcare` is deployed at `https://shcare.web.app` (version `0cace76db422ed7c`, release `1782257445764000`). SPA document routes use `no-cache, no-store, must-revalidate` while hashed assets use long-lived immutable cache headers. The deployed Signal Horizon page and Render `/api/health` both returned HTTP 200 on 2026-06-24.
- This release does not claim complete backend persistence or Supabase/Postgres authorization validation. Real authenticated doctor/clinic E2E, API mutation/error states, and database RLS/repository parity remain required before calling all portal actions production-complete.

- Canonical remote-first product direction is documented in `D:\Study\KLTN\docs\SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`.
- Smart Health is positioned around connected device deployment, realtime remote monitoring, stored clinical audio, AI support, sharing, and workspace administration; it is not an in-room traditional stethoscope replacement.
- One activated device can measure many patient profiles. Device quota means activated/deployed machines in a workspace.
- Personal/family workspaces should support multiple family/dependent patient profiles under one account; separate accounts for every family member are optional, not required.
- Clinic/hospital management is web-first through `shcare.web.app` Workspace Portal. `shcare-admin.web.app` is reserved for Platform Admin/system administration only.

## 2026-06-12 Web Surface Split

- Chosen architecture: `shcare-admin.web.app` for Platform Admin only, `shcare.web.app` for doctor/clinic portal, Android for patients and doctors.
- Web codebase now has surface mode via `VITE_SMART_HEALTH_WEB_SURFACE`; Firebase builds produce `dist-firebase` for admin and `dist-firebase-portal` for portal.
- Login/layout guards now block the wrong surface and show a CTA to the correct domain instead of silently treating workspace users as admin users.
- Backend `/api/me` exposes `allowedSurfaces`, `defaultSurface`, and `currentWorkspace`; backend also adds `/api/portal/*` semantic wrappers for portal flows while preserving legacy API compatibility.
- Figma prompts are split: `Figma_Admin_Web_Prompt.md` is platform-admin-only; `Figma_Shcare_Web_Portal_Prompt.md` defines the Shcare Web Portal screens and prototype flows.

## 2026-07-01 Firebase Doctor Role/Surface Sync

- Root cause of the reported two-screenshot login contradiction: the account `baobee100624@gmail.com` had Firebase custom claim `doctor` for `vn_hospital_quan_y_175`, but the live backend stored/returned it as `patient` with `allowedSurfaces=["android"]`. The Shcare Portal login then mislabeled any non-portal denial as "admin uses shcare-admin", while Web Admin correctly rejected the account as not platform admin.
- Backend `upsertFirebaseUser(...)` now treats trusted Firebase custom claim `doctor` as an approved backend doctor role, sets `requestedRole=doctor`, `roleRequestStatus=approved`, keeps `accountType=doctor`, updates membership role, and materializes the claimed catalog workspace before returning `/api/me`.
- `productionRoleSmokeTest.js` now adds `doctor.portal.smoke@smarthealth.test` and asserts `role=doctor`, `roleRequestStatus=approved`, `allowedSurfaces` includes `portal`, `defaultSurface=portal`, workspace capabilities exist, and no `platform.*` capabilities leak.
- `smart-health-web` auth now rejects stale/non-portal Firebase sessions cleanly and maps login errors to the right Vietnamese message instead of a single wrong-surface message.
- Deployment/verification completed: backend commit `be70b551` pushed to `origin/main` and Render served the fix; `shcare.web.app` version `b7b7cbd5b2aa7ea4` and `shcare-admin.web.app` version `3dd196503be75e50` were released; live account audit returned `role=doctor`, `allowedSurfaces=["portal","android"]`, `defaultSurface=portal`, workspace `Bệnh viện Quân y 175`; `npm.cmd run smoke:production-roles` and `npm.cmd run smoke:public-deployment` passed.

## 2026-07-02 MSM261 Firmware-only Correction

### Implemented

- Corrected the firmware scope after user confirmation: INMP441 is no longer required and is not an active target for product work.
- Kept the active firmware path as `D:\Study\KLTN\smart-health-embedded\MSM261S4030H0`.
- Updated handoff/runbook text so future backend, web, admin, Android, and firmware work does not route back to INMP441.
- Regenerated `MSM261S4030H0\compile_commands.json` so IDE/compiler database paths no longer point to the retired INMP441 folder.

### Verification

- Backend passed: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, rerun `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, and `npm.cmd run smoke:api-production`.
- Live account audit for `baobee100624@gmail.com` passed without printing tokens: Firebase claim `doctor`, backend `role=doctor`, `roleRequestStatus=approved`, `allowedSurfaces=["portal","android"]`, `defaultSurface=portal`, workspace `Bệnh viện Quân y 175`, and no platform capability.
- Web Portal passed: `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, live `https://shcare.web.app` HTTP 200, no localhost API in live main bundle, and Render API present.
- Web Admin passed: `npm.cmd run build:firebase:admin`; live fetched JS assets contain no old `Tài khoản chưa có quyền quản trị` guard text.
- Android passed: `.\gradlew.bat :app:compileDebugKotlin`.
- Firmware passed: MSM261 default, normal `esp32-s3-devkitm-1`, and OTA `esp32-s3-ota` PlatformIO environments.

### Remaining Limits

- `check:production:strict` remains blocked only in the local shell because Render/Supabase/S3/PHI/email envs are not loaded there. Workspace inspection found no Render CLI/API key/config, so host envs could not be inspected directly.
- Physical ESP32-S3 validation still requires a connected board, real WiFi, device id/secret from Web Admin, flash/upload, serial monitor, heartbeat/audio evidence, and OTA evidence.

## 2026-07-02 Web Registration Email Verification Hardening

### Implemented

- Added backend `POST /api/auth/email-verification` for Shcare Web registration and resend flows.
- The endpoint requires a Firebase bearer token, reloads Firebase Auth state, returns `verified` for already verified accounts, otherwise creates a Firebase Admin email-verification action link and sends a branded email through the existing Brevo/SMTP `sendEmail()` stack.
- The verification OOB link is never returned to the browser; only safe status/provider metadata is returned.
- Added `WEB_PORTAL_URL`/`SHCARE_WEB_URL`/`SMART_HEALTH_WEB_URL`/`PUBLIC_SITE_URL` continue-URL resolution and optional `FIREBASE_AUTH_LINK_DOMAIN` support.
- Shcare Web doctor/workspace registration no longer relies on Firebase Web SDK `sendEmailVerification()` inside account creation. The completion state now says whether backend email delivery succeeded or failed.
- Email verification resend now refreshes Firebase state, authenticates to backend, then calls the backend delivery endpoint.
- `AuthProvider` now keeps pending/needs-info/rejected onboarding sessions instead of signing them out as non-portal accounts, while `PortalLayout` continues to block non-portal access.
- Login now routes pending/needs-info/rejected accounts to `/cho-duyet`, `/can-bo-sung`, or `/bi-tu-choi` instead of showing only a generic blocked login message.
- Added `npm.cmd run smoke:firebase-email` to validate Firebase Admin can generate a verification link for `https://shcare.web.app/xac-nhan-email` without sending email or printing the OOB code.

### Verification

- Backend passed: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, `npm.cmd run smoke:api-production`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:public-deployment` rerun, and `npm.cmd run smoke:firebase-email`.
- Runtime endpoint smoke passed locally with a temporary unverified Firebase user: without Brevo envs, `POST /api/v1/auth/email-verification` returns explicit email-provider configuration error instead of pretending delivery succeeded.
- Shcare Web passed: targeted Prettier, targeted ESLint, `bunx tsc --noEmit --pretty false`, and production `bun run build:firebase`.
- Web Admin passed: `npm.cmd run build:firebase:admin`.
- Android passed: `.\gradlew.bat :app:compileDebugKotlin`.
- Firmware passed: MSM261 PlatformIO default build, including normal and OTA environments.
- Production deploy passed: backend commit `7ca15841` reached Render and live unauthenticated `POST /api/auth/email-verification` returns 401 instead of 404. Shcare Web Firebase Hosting version `aac78c3631f574b4` is live on `https://shcare.web.app`.
- Production canary passed: a temporary unverified Firebase doctor user authenticated against Render, called `POST /api/auth/email-verification`, and received `status=sent` with `provider=brevo`; the temporary backend user was deleted. CORS preflight from `https://shcare.web.app` to the endpoint returned 204.

### Remaining Limits

- Local `check:production:strict` still reports `BLOCKED` because local PowerShell does not contain Render/Supabase/S3/PHI secrets, including local Brevo envs.
- Render accepted the production email canary through Brevo. Final human inbox confirmation still requires checking the mailbox/spam folder for the canary or a real registration email, because this workspace cannot read the user's mailbox.

## 2026-07-02 Shcare Web Source / CI Tracking

- `smart-health-web` source is now prepared for Git tracking instead of being only a local untracked deployed artifact.
- The tracked set includes source, config, `bun.lock`, Firebase Hosting target config, public assets, design reference files, `docs/Logo.png`, and the `MẪU UI UX/bacsi.mp4` runtime video imported by the home page.
- Generated/local artifacts stay untracked through `.gitignore`: `dist/`, `dist-firebase/`, `.firebase/`, `.vite/`, `.tanstack/`, `.lovable/`, and `firebase-debug.log`.
- Added GitHub Actions workflow `.github/workflows/deploy-shcare-web.yml` for `shcare.web.app`; it builds with Bun, validates required Firebase secrets, then deploys Firebase Hosting target `webapp`.
- Verification passed from `smart-health-web`: `bun install --frozen-lockfile`, `bun run lint`, `bunx tsc --noEmit --pretty false`, and production `bun run build:firebase`.

## 2026-06-09 Core Realtime Cleanup

- Production backend no longer auto-seeds demo users, organizations, devices, or notifications when `AUTH_MODE=production`.
- Scan creation, scan recording, and device socket registration now require an explicit device id in production; demo fallback only remains in non-production mode.
- Realtime browser listeners at `/listen` and `/app` now accept `?token=` or `?access_token=` and production rejects anonymous listening.
- `/api/me` now exposes `scopeType` and `scopeLabel` so the UI can clearly show platform admin versus workspace/hospital scope.
- Verified `npm run check` and `npm run smoke:workspace-access` after the cleanup.

## 2026-06-09 Android App Reality Pass

- Android no longer starts scans with the fake `android-app` device id. New Scan and Live Monitoring require a backend device selection and send the selected `device.id` to scan APIs.
- Medical Records and Record Detail no longer show hardcoded demo records, fake AI confidence, fake tags, or random waveform data. Empty/error states now describe real backend state.
- Account/Profile now uses `/api/me` for real profile fields, treats Firebase email as read-only, uploads/deletes avatar through `/api/me/avatar`, and formats real account dates.
- Forgot Password and Change Password now use Firebase Auth APIs instead of the old backend placeholder password endpoints.
- Phone/SMS login and contact verification no longer accept OTP `123456`; they explain that SMS/OTP requires a real provider and route users back to Firebase email login.
- Android FCM is now integrated: `firebase-messaging` dependency, `SmartHealthFirebaseMessagingService`, Android 13+ `POST_NOTIFICATIONS` permission request, token registration after Firebase/backend auth, and refreshed-token registration through `/notifications/register-device`.
- Notification settings are now backend-backed through `/api/me.notificationPreferences`; backend normalization preserves `enabled`, `sound`, `vibration`, `abnormalResults`, `deviceOffline`, `appointments`, `messages`, `aiUpdates`, `newLogin`, and `doctorRequests`.
- Verification passed: Android `:app:compileDebugKotlin`, Android `:app:assembleDebug`, backend `npm run check`, emulator install/launch smoke, phone-login UI smoke, notification permission dialog smoke, and Android demo/no-op string audit.

## 2026-06-11 Skills And Android Signup Picker

- Historical 2026-06-11 state: `mattpocock/skills` was initially installed inside `smart-health-embedded`; this was superseded by the user-wide migration below.
- Added `D:\Study\KLTN\docs\SMART_HEALTH_AGENT_SKILLS_GUIDE.md` so future chats choose only the needed skill: `smart-health-project` for Smart Health rules, `diagnosing-bugs` for bugs, Android emulator/ADB for app QA, and `handoff` only for compact temporary handoff.
- Current convention: global registry + user-wide skills + Smart Health handoff docs. Project-local `.ai_skills`, `.agents/skills`, and `skills-lock.json` are not used.
- 2026-06-22 migration: replaced that project-local installation with 26 current filtered Matt Pocock skills in `C:\Users\baobe\.agents\skills`; removed `D:\Study\KLTN\smart-health-embedded\.agents` and its `skills-lock.json`. Renamed current equivalents such as `diagnosing-bugs`, `codebase-design`, and `writing-great-skills` supersede stale upstream names.
- Installed global `impeccable` v3.8.0 and configured global/Smart Health instructions to combine it with `gpt-taste` for every future UI task. No UI skill payload or hook was added inside an individual Smart Health repo.
- Fixed Android doctor signup catalog UX: when backend `/api/catalog/clinics` or `/api/catalog/specialties` fails, `Cơ sở y tế` and `Chuyên khoa` stay clickable, open a dialog, show the actual error/empty state, and provide `Tải lại danh mục`.
- Verification passed: Android `:app:compileDebugKotlin`, Android `:app:assembleDebug`, emulator install/launch, doctor signup tab smoke, specialty dialog smoke, clinic dialog smoke, and logcat check with no app `FATAL EXCEPTION`.

## 2026-06-12 Doctor Request-Info Sync Fix

- Fixed the doctor approval request-info loop that could send an admin email but leave the doctor row in the old Web Admin tab and leave Android unaware of the request.
- Backend repository mode now preserves `roleInfoRequiredFields` in user `firebase_claims`, reloads `/api/auth/firebase` users by Firebase UID or email before returning status, and emits a dedicated `doctor_info_requested` notification with required-field metadata.
- Web Admin Doctor Approval now updates the changed row from the request-info response, switches the controlled tab to `needs_info`, and then refreshes the list, so the account moves to the needs-info bucket immediately after success.
- Android `DoctorApprovalPendingScreen` polls the backend every 15 seconds while pending, shows the admin request message plus required fields, and treats `doctor_info_requested` notifications as warning-style notifications.
- Verification passed: backend `npm.cmd run check`, Web Admin `npm.cmd run build`, Android `.\gradlew.bat :app:compileDebugKotlin`, Android `:app:installDebug`, emulator launch on `emulator-5554`, pending-screen UI tree dump, and crash-buffer scan with no app crash.
- Deployment completed on 2026-06-12: pushed commit `4e8548e` to `origin/main` for Render backend auto-deploy, deployed Firebase Hosting Web Admin version `f13b8b22666bc3cd`, confirmed `/api/share-targets` now returns authenticated-route `401` instead of old `404`, and public deployment smoke passed.
- Production follow-up: the first deploy still returned stale `pending` rows because SQL role-request saves sent `""` into `timestamptz` columns and the old repository path swallowed the Postgres error. Commits `951c82c` and `7f1cdef` added direct guarded request-state persistence and converted empty role-request timestamps to `null`. Render verification then moved `baobee1006@gmail.com` to `needs_info`; `/api/admin/doctor-requests?status=pending` returned 0, `status=needs_info` returned 1, and `/api/auth/firebase` for the doctor UID returned `roleRequestStatus=needs_info` with request message and required fields.
- Resubmit follow-up: the Android screen could switch to pending after submit, then poll back to `needs_info`, because `/api/auth/role-request` still used the generic repository save path and could return a mutated memory object without proving the SQL row changed. Backend now has `repositories.users.resubmitDoctorRequest(...)` for `needs_info -> pending`, clears `roleInfoRequestMessage` and `roleInfoRequiredFields`, and uses guarded `updateDoctorRequestState(...)` for admin approve/reject/request-info. Verification added to `npm.cmd test` covers `pending -> needs_info -> resubmit -> pending` plus admin list buckets and auth polling.
- Registration reason follow-up: the Android role-request reason now survives repository-backed mode as `registrationReason`, is returned by `/api/auth/firebase` and `/api/admin/doctor-requests`, and is parsed by Android. Web Admin Doctor Approval now displays the real reason before fallback status text. Platform-admin notification emails for doctor role requests now include the real reason, doctor contact/profile metadata, and a CTA to `/doctor-approval` instead of only `/notifications`.
- Deployment follow-up: commit `4ce7915` was pushed on 2026-06-12, Firebase Hosting Web Admin version `5124335308359eb3` went live, `npm.cmd run smoke:public-deployment` passed, and a production canary confirmed `baobee1006@gmail.com` appears in pending with the exact submitted `registrationReason` and matching notification metadata.
- Stale profile-field/solo-practice follow-up: backend role-request resubmit now persists and re-exposes updated `name`, `phone`, `license`, `hospital`/private clinic name, `department`, `registrationReason`, `workspaceType`, `accountType`, and `clinicSuggestion`; admin email metadata translates `solo_practice`/`solo_doctor` to Vietnamese labels. Android signup lets `Bác sĩ tư` choose or enter a private clinic name and stores that value instead of the old hardcoded `Phòng khám cá nhân - <name>` string. Android needs-info resubmit detects `solo_practice` and asks for `Tên phòng khám tư`, while facility doctors still use the clinic catalog. Web Admin Doctor Approval shows `Loại` (`Bác sĩ tư`/`Bác sĩ cơ sở`) and `Phòng khám/cơ sở`, and maps `clinicSuggestion` before falling back to catalog data. Verification passed: backend `npm.cmd run check`, backend `npm.cmd test`, Android `.\gradlew.bat :app:compileDebugKotlin`, and Web Admin `npm.cmd run build:firebase`.
- Deployment follow-up: commit `72b0f3d` was pushed to `origin/main` on 2026-06-12 for Render auto-deploy, Firebase Hosting Web Admin version `7de2656be1036977` was released to `https://shcare-admin.web.app`, `npm.cmd run smoke:public-deployment` passed, and an authenticated Render canary with the platform smoke admin confirmed `/api/admin/doctor-requests` responses include `workspaceType`, `accountType`, `clinicSuggestion`, `registrationReason`, `phone`, and `hospital` fields.
- Android needs-info UI follow-up: `DoctorApprovalPendingScreen` no longer exposes a manual `Loại đăng ký` selector in the request-info form. The screen derives doctor type from the original backend `accountType`/`workspaceType`: private doctors see `Tên phòng khám tư`, facility doctors see the facility picker, and resubmit sends the same type back to backend. The background status poll still stops in `needs_info` to avoid overwriting form edits. Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin` and `.\gradlew.bat :app:assembleDebug`.
- Android email-verification follow-up: Firebase resend/check now reloads `currentUser` before using cached `emailVerified`. `SplashScreen` reloads before routing to `verify-email`, and `FirebaseVerifyEmailScreen` now distinguishes "not verified yet", Firebase session/token failure, backend auth failure, and doctor/patient role-request failure. Resend no longer claims a new email was sent when Firebase already marks the account verified; it tells the user to press `Tôi đã xác thực email` and continue. Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, emulator install/launch, and crash-buffer scan.
- Android auth UI spacing follow-up: all literal `Quay lại`/`ArrowBack` screens were reviewed. The high back button in auth/verification flows came from shared `VerificationBackButton`; it now uses `statusBarsPadding()` plus the lower 16dp content offset so verify-email, phone-login fallback, and contact verification screens match the lower signup/forgot-password spacing. Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, emulator install/launch, UI dump, and crash-buffer scan.
- Android doctor-login recovery follow-up: `LoginScreen` no longer overwrites a full `PendingRegistration` with blank data when a doctor logs in before Firebase email verification. For verified doctor logins where `/api/auth/firebase` returns no pending/approved/rejected doctor request, the app now resubmits the stored doctor role request, preserves solo-practice vs facility metadata, routes to pending approval on success, and shows a distinct message for truly rejected requests. Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, emulator install/launch, and log scan with no `FATAL EXCEPTION`/`AndroidRuntime`/`ANR`.
- Backend/Android doctor-login recovery follow-up: the red "Email đã xác thực nhưng chưa gửi lại được hồ sơ bác sĩ" path was traced to `requestRole` failing before Android could route to pending approval. Backend now upserts the selected clinic/solo-practice workspace before repository-backed doctor-request persistence, which prevents new private-doctor workspaces from violating SQL organization references. Android `SmartHealthApi` now reads standard error-object messages, and `LoginScreen` re-checks `/api/auth/firebase` after a role-request exception so a request that did persist still routes to pending approval. Verification passed: backend `npm.cmd run check`, backend `npm.cmd test`, Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, emulator install/launch, and crash/log scan.
- Deployment verification: commit `8a2c9a4` was pushed to `origin/main`; `npm.cmd run smoke:public-deployment` passed against Render/Firebase Hosting; a Render production canary created a temporary verified Firebase private-doctor account, posted `/api/auth/role-request` with `accountType=solo_doctor` and `workspaceType=solo_practice`, confirmed `roleRequestStatus=pending` and pending-list visibility through platform admin, then deleted the canary doctor account.
- Doctor account lock follow-up: Web Admin doctor lock now maps to a real backend account lock instead of only downgrading role/claims. `PATCH /api/admin/doctors/:id/lock` keeps the approved doctor row visible, sets `accountStatus=locked`, disables linked Firebase Auth when configured, revokes Firebase refresh tokens, revokes backend demo/Firebase sessions, and auth/login guards reject locked users. Unlock sets `accountStatus=active`, restores doctor role/custom claims, and re-enables Firebase. Verification passed: backend `npm.cmd run check`, backend `npm.cmd test`, and Web Admin `npm.cmd run build`.
- Deployment verification: commit `320f519` was pushed to `origin/main`; Firebase Hosting Web Admin version `0cd9234ba6609f76` went live; `npm.cmd run smoke:public-deployment` passed; production canary created a temporary approved doctor, locked it, confirmed `accountStatus=locked`, Firebase Auth `disabled=true`, old doctor token HTTP 401, unlocked it, confirmed Firebase Auth re-enabled and backend auth returned `role=doctor/accountStatus=active`, then deleted the canary doctor and Firebase user.

## Backend: `smart-health-embedded\web-monitor`

### Implemented Or Started

- Node.js backend remains the main server; no framework rewrite.
- Firebase token verification lives in `src/firebaseAuth.js`.
- Data backend abstraction lives in `src/dataStore.js`.
- JSON runtime mode remains the fast local demo path.
- PostgreSQL schema/migration foundation exists under `db/migrations`.
- Production foundation files/docs exist, including:
  - `docs/backend-foundation.md`
  - `docs/operations.md`
  - `public/openapi.yaml`
  - `Dockerfile`
  - `docker-compose.yml`
- Core API areas present in `server.js` include:
  - auth/Firebase mapping
  - role requests
  - admin doctor approval
  - notifications
  - devices
  - patients
  - scans/audio
  - AI summaries
  - audit/access logs
  - storage/export/admin helpers
- `/api/v1` direction is established while keeping legacy routes.
- `/api/auth/firebase` now self-heals stale JSON `firebaseUid` values when a verified Firebase token matches an existing user by email. A 2026-05-26 local data repair updated `nguyengiabao100624@gmail.com` from a deleted Firebase UID to `YOPbEgWu4pfRjMsbb8X5zOFBwUx1`, preserving `role=admin` and `organizationId=org_default_clinic`.
- `/api/auth/role-request` now uses a guarded repository write for doctor resubmission, so `needs_info -> pending` must be confirmed by the persisted row before the API returns success. It still creates backend notifications with user/organization metadata. A 2026-05-26 local data repair restored the pending request for `baobee100624@gmail.com` after a notification-only approval request.
- `DELETE /api/admin/doctors/:id` finds users by backend id or `firebaseUid`, refuses non-doctor/admin deletes, deletes the linked Firebase Auth account first when configured, then removes backend user/session/membership/notification-device/access links and appends `doctor.delete` audit metadata. Firebase delete failures return an API error so the admin UI cannot falsely report success while the Firebase user remains.
- `PATCH /api/admin/doctors/:id/lock` and `/unlock` now keep doctor approval state separate from account lock state. Lock uses `accountStatus=locked`, revokes sessions, disables Firebase Auth/revokes refresh tokens when configured, and returns lock metadata/warnings. Unlock restores `accountStatus=active`, doctor Firebase claims, and Firebase enabled state.
- `PATCH /api/admin/clinics/:id` updates clinic profile fields and status. Web admin uses it for edit and temporary lock/unlock; inactive clinics remain in admin but are excluded from the public signup catalog.
- `organizations` now carries workspace semantics in JSON mode: `workspaceType`, `ownerUserId`, `packageId`, `subscriptionStatus`, and `billingCycle`. `/api/admin/workspaces` is an alias over the same data while `/api/admin/clinics` remains compatible for existing UI/app code.
- `GET /api/admin/clinics` and `/api/admin/workspaces` return usage/quota summaries for doctors, patients, devices, storage, AI, and package limits.
- `POST /api/admin/workspaces/:id/package` assigns a service package to a workspace and appends subscription/audit metadata.
- `POST/PATCH/DELETE /api/admin/packages` now supports real package CRUD, including `segment=organization|solo_practice|personal` and quota fields.
- `POST /api/auth/role-request` accepts `accountType`/`workspaceType`; personal users get a personal workspace and solo doctors get a solo-practice workspace before approval.
- `/api/me` now returns `workspaceId`, `currentWorkspaceId`, `currentMembership`, `memberships`, `workspace`, and `capabilities` so frontend can begin separating Platform Admin Console from Workspace Portal behavior.
- Web admin `Layout` now applies first-pass page-level access blocking from the same capability map used by the sidebar. Direct URL navigation to restricted admin pages shows an access-denied panel after `/api/me` resolves instead of rendering page content. The topbar also labels the current mode as Platform Admin Console or Workspace Portal and shows the current workspace name/type from `/api/me`.
- Web admin `Layout` capability/menu filtering is no longer crashing the admin route; a missing `useMemo` import was fixed after the `/` route showed the generic "Không thể tải màn hình này" error boundary.
- Web admin now has shared frontend capability helpers in `AdminAccessContext.tsx` and `action-permissions.ts`. Major action surfaces are capability-gated on Admin Actions, Packages, Clinics, Doctors, Devices, Patients, Storage, Notifications, and Doctor Approval; backend `403` remains the required enforcement layer.
- `/api/patients` now uses capability/workspace scoping: platform admin can see all, workspace roles see current-workspace profiles, doctors with explicit `doctorPatientAccess` grants are limited to granted/owned profiles, and personal/patient users remain limited to their own/self profiles. Scan listing reuses patient access scoping.
- `/api/devices` list and management routes now use capability/workspace scoping in JSON/demo mode. Device quota semantics remain "activated/deployed devices"; one device can still be paired/used for multiple profiles. Solo-practice workspace owners get device-management capability for their own workspace.
- JSON-mode `saveDeviceRecord(...)` now persists devices with `saveDb()` instead of incorrectly calling scan persistence, so device connect/disconnect/calibrate/revoke-style actions do not hit an undefined `scan` variable.
- 2026-06-06 cloud device control slice:
  - backend keeps a `deviceSockets` registry for outbound ESP WebSocket connections and marks devices online from `connected` state or recent `lastSeenAt`.
  - ESP `hello`/`telemetry` messages update `lastSeenAt`, WiFi SSID/RSSI/IP, firmware version, audio status, OTA status, backend host/port, and device event history.
  - `POST /api/v1/devices/:id/commands` creates a command, delivers it through WebSocket when the device is connected, optionally publishes to MQTT when configured, records `lastCommand`, appends device events, and writes audit.
  - `GET /api/v1/devices/:id/events` returns recent heartbeat/command/OTA/error events for scoped users.
  - Storage uploads now persist SHA-256 checksum metadata and infer firmware version for `.bin` files in bucket `device-firmware`.
  - `POST /api/v1/devices/:id/ota` now creates a cloud OTA command with firmware version, HTTPS download URL or `firmwareFileId`, checksum, delivery status, event history, and audit. When `firmwareFileId` is used, backend creates a short-lived tokenized download URL for the ESP and hides the tokenized URL from normal device API responses. It no longer models product OTA as a same-LAN ArduinoOTA action.
- 2026-06-06 production readiness slice:
  - `src/productionReadiness.js` builds deployment checks for auth mode, Firebase Admin, public HTTPS backend URL, CORS, Postgres, Redis, S3/R2 storage, PHI encryption, Brevo email API/SMTP fallback, SMS/Zalo webhook, MQTT/TLS, cloud OTA URL, signed firmware warning, Web Admin product build, and Android release build.
  - `scripts/productionReadiness.js` exposes `npm run check:production` and `npm run check:production:strict`.
  - `GET /api/v1/settings/production-readiness` is platform-settings-manage only, so workspace admins do not see global infrastructure env/status.
  - `web-monitor\.env.example` now lists production placeholders for the real third-party services and secrets.
- `/api/scans` creation/start/stop/audio-upload/complete mutations now require scan-management capability and reuse patient/device access checks. Read/audio/signed-url routes still allow scoped viewers with patient access.
- `/api/admin/*` now uses `requireUser` plus backend capability checks so workspace roles can use Workspace Portal endpoints without becoming platform admins.
- Storage upload/share/delete/download and object/signed URL access now use backend capability and record-scope checks. Manual storage files require storage management capability; scan audio remains readable to users who can access the scan.
- `/api/exports` list/create/download now requires report/export capability and blocks cross-workspace export downloads.
- `/api/patients/:id/shares` supports first-pass profile/selected-scan sharing to a doctor user or workspace with expiry metadata and audit records; selected-scan grants restrict scan access to the listed scans.
- `scripts/workspaceAccessSmokeTest.js` and `npm run smoke:workspace-access` seed a temporary JSON backend and test `platform_admin`, `workspace_admin`, `doctor`, `technician`, `billing`, and `viewer` via real HTTP login/API calls.
- Storage/object/export/notification/access-log routes have first-pass JSON/demo scoping: storage records filter by scan/workspace access, local object download checks the `org/{workspaceId}` object key or scan link, exports only include scoped patients/scans/exports, notifications are filtered by target user/workspace, and access logs keep/use optional `userId`/`organizationId` when present.
- `403` access-control failures now append `access.denied` audit metadata and warning access logs with method, path, request id, actor, workspace, and auth source when request context is available.
- Error response shape direction:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Không có quyền truy cập.",
    "requestId": "req_..."
  },
  "message": "Không có quyền truy cập.",
  "code": "forbidden",
  "statusCode": 403,
  "requestId": "req_..."
}
```

### Known Backend Limits

- Some handlers still operate on JSON-like in-memory/state objects.
- Normalized PostgreSQL tables are not yet the single source of truth for all users, orgs, patients, devices, scans, audio, AI, notifications, and audit.
- `activeRecording` or equivalent live scan state must be treated as local-process demo state until moved to Redis/Postgres.
- WebSocket and UDP audio paths are not fully authenticated.
- ESP WebSocket secret validation exists for records with a stored device secret, but production still needs mandatory per-device credentials/certificates, TLS CA validation, replay protection, and key rotation policy.
- Cloud OTA currently accepts manual firmware URL/checksum or a `device-firmware` storage file with backend-generated tokenized download URL, and firmware verifies SHA-256. Production still needs signed firmware, trusted CA certificate handling instead of demo `setInsecure()`, rollback policy, and physical-board OTA evidence.
- Audio download/open-in-tab can return 401 if the frontend opens a protected URL without passing a bearer token. Prefer authenticated fetch/download wrappers or signed URL endpoints.
- Object storage routes should be tested before calling them production-ready.
- FCM delivery, notification retry, preferences, and failure tracking are incomplete.
- Rate limit, PHI encryption, immutable audit, consent expiry, and export/download audit need hardening.

## Web Admin: `smart-health-admin\thiết kế giao diện`

### Implemented Or Started

- Vite/React admin dashboard with Vietnamese UI and medical SaaS style.
- Firebase login is wired.
- API wrapper is in `src/lib/smart-health-api.ts`.
- Doctor approval page is connected to backend for list/approve/reject/request-info flows.
- Doctors management delete confirms that Firebase Auth will be deleted too, calls the backend delete endpoint, and surfaces warnings when the backend account has no linked `firebaseUid` or Firebase Auth is disabled.
- Doctors management lock/unlock calls the backend lock endpoints and surfaces backend warnings, so admins can tell whether Firebase Auth was also updated or only backend state changed.
- Clinics management menu actions are wired: statistics opens the detail drawer, edit reuses the clinic form with existing data, lock/unlock toggles backend status, and delete calls the backend with in-use protection.
- Notifications/topbar/dropdown/detail flows have been worked on.
- Storage UI and bucket/file workflows have been expanded toward real API use.
- PDF/export font handling was fixed to avoid jsPDF `Unicode` errors from invalid font base64.
- Core admin list screens no longer initialize from demo rows when backend data is unavailable:
  - AI measurements
  - audit log
  - clinics
  - doctors
  - patients
  - devices
- Backend load failures now clear stale rows and show a Vietnamese warning that the page is not using sample data to avoid false information.
- Export data/report dialogs now build sheets from live backend API results for scans, patients, doctors, clinics, and devices.
- Legacy web admin `MOCK_DATA` export scaffold was removed from `export-utils.ts`.
- Capability-based action gating has started across the main admin pages: create/edit/delete package/workspace/staff/device/patient/storage/notification/doctor-approval actions are hidden or guarded when `/api/me` does not grant the required capability.
- Overview now presents Platform Admin Console vs Workspace Portal context and shows Workspace Portal v1 entry points: overview, staff, patients/family groups, devices, and live monitoring.
- On 2026-06-05, web admin browser capture found a runtime crash on Overview because `Users` from `lucide-react` was referenced without import. `Overview.tsx` now imports `Users`, the dashboard renders again, Chrome DevTools screenshot capture covered the main admin modules, and `npm run build` passed afterward with only Vite bundle-size warnings.
- Device provisioning dialog sends `organizationId` only for platform admins; workspace technicians can pair/provision within their backend-scoped workspace without editing billing/package/workspace fields.
- Devices page was rewritten around cloud-first operation: it shows backend-derived online/offline state, WiFi/IP/RSSI, firmware/audio/OTA status, heartbeat freshness, latest command, event history, recovery-portal instructions, and a cloud OTA form that can select uploaded `.bin` files from `device-firmware` to prefill version/checksum or fall back to manual URL/checksum entry. Local `.local/admin` management is no longer presented as the normal product path.
- Settings now has a platform-only `Triển khai` tab backed by `/api/v1/settings/production-readiness`. It groups required failures, warnings, passes, and manual checks for Firebase, HTTPS backend, Postgres, S3/R2, PHI encryption, outbound channels, MQTT, Web Admin product build, Android release build, and firmware hardening. Workspace admins do not get this global infrastructure checklist.
- Firebase Hosting production deployment is active for Web Admin at `https://shcare-admin.web.app`. The app builds with `npm.cmd run build:firebase`, deploys to hosting target `admin`, and points to Render backend `https://smart-health-api-xj0a.onrender.com`. Chrome smoke verified clean unauthenticated `/` redirecting to `/login`, Firebase Auth login with a platform admin smoke account, direct dashboard reload when the Firebase session exists, logout returning to `/login`, clean console, and `/api/me`, notifications, overview stats, and devices API calls returning 200. Hosting now sends `Cache-Control: no-cache, no-store, must-revalidate` to avoid stale SPA bundles after auth/deploy fixes.
- Firebase Hosting site `https://shcare.web.app` is reserved for the future Android-like web app but intentionally has no app deployed yet, so 404 is expected until that web app is implemented.
- Obvious ASCII/no-accent toast/error strings were corrected in device, notification, account, settings, and audio download paths.
- Admin user-facing Account/Settings/Devices copy was cleaned so buttons no longer describe themselves as demo/KLTN/local-only; provider-dependent controls still show deployment/configuration reasons when unavailable.
- UI fixes have been done for:
  - drawer opening only after selecting rows/actions
  - package badge overlap
  - notification mojibake
  - toggle contrast
  - device status card/donut polish
  - unread notification badge direction

### Known Web Admin Limits

- Export/report dialogs now use backend data, but still need browser smoke testing with real authenticated sessions for every format: PDF, Excel, CSV, JSON, and SQL.
- Cloud OTA release selection is wired for bucket `device-firmware`, but still needs physical-board smoke evidence and signed-firmware hardening before it is production-complete.
- Overview KPIs and sidebar/module badges must be verified after each backend mutation.
- Several add/edit/delete/share/export dialogs may need final API smoke testing and deeper field-level capability checks.
- Account info must come from `/api/me`/Firebase user and not hardcoded demo email.
- Any mojibake found in UI strings should be fixed at source and saved as UTF-8.
- Dangerous actions must use confirm modal and audit logging.

## Android: `smart-health-android`

### Implemented Or Started

- Firebase config exists in `app/google-services.json`.
- Firebase auth service handles signup/login/email verification/token retrieval.
- Doctor signup flow:
  - creates Firebase account
  - sends real email verification
  - stores pending registration in SharedPreferences
  - after verified, submits role request to backend with clinic, specialty, CCHN, name, phone, and reason
  - routes doctor to pending approval screen
- Doctor signup uses a searchable backend hospital/clinic catalog instead of free-text hospital input; if missing, the doctor can request adding that facility. Signup and pending-info pickers use dialogs with search and scrollable lists to avoid Compose dropdown tap/focus issues.
- Doctor pending approval screen supports `needs_info`, profile update, clinic/specialty search pickers, and resubmit.
- Navigation includes account type in verification route so doctor/patient flow survives route changes.
- Global route transitions are implemented via `ui/motion/SmartHealthMotion.kt` and wired into `AppNavGraph.kt` with Navigation Compose enter/exit/pop transitions.
- Live audio client connects to backend WebSocket for demo audio playback and metrics.
- Live audio client sends the current API bearer token on the WebSocket request when available, and Android device screens now parse/use backend cloud device fields (`online`, WiFi RSSI/SSID/IP, firmware, OTA status, audio status) instead of assuming Bluetooth/local status.
- API wrapper has endpoints for auth, role requests, settings, notifications, access logs, devices, AI, exports, patients, and scans.
- API wrapper now includes patient share endpoints. `Patient` includes `profileType` and `relationship`.
- New Scan loads patient profiles, lets the user add a dependent/family profile, and starts scans with the selected profile id.
- Medical Records can share a selected scan/profile to a doctor/workspace id through the backend sharing endpoint.
- Android push notification foundation is now real: the app requests notification permission on Android 13+, gets FCM tokens, registers them to backend notification devices after auth, and has a `FirebaseMessagingService` for refreshed tokens/messages.
- Notification settings load and save per-user backend preferences through `/api/me` instead of local-only Compose state.
- Profile avatar upload/delete, profile save, Firebase password reset, and Firebase password change are wired to real backend/Firebase APIs.
- Phone/SMS login remains unavailable until a real SMS provider is configured, and the UI now states that clearly instead of simulating OTP.

### Known Android Limits

- Doctor profile clinic/specialty edit is connected to canonical fields, but the profile UX still needs a full visual polish pass.
- Some older Compose screens may still contain mojibake text; fix strings as UTF-8 when touched.
- Live WebSocket sends the Android bearer token when available, but backend listener/device WebSocket auth enforcement still needs a full production pass.
- FCM token registration is complete, but actual push delivery still needs Firebase Admin Cloud Messaging send logic, provider-side smoke, notification-channel/local display polish, and retry/failure tracking.
- No production scan upload/offline queue.
- No BLE/captive portal provisioning UI for ESP32.

## Firmware: `MSM261S4030H0`

### Implemented Or Started

- PlatformIO Arduino projects for ESP32-S3.
- `MSM261S4030H0` captures audio and now sends PCM frames to backend over outbound WebSocket/WSS when cloud is configured, with UDP kept as an optional development fallback.
- INMP441 is retired from the current product scope; do not use it for future firmware, backend, app, or admin integration decisions.
- WiFi/server values should be provided via build flags or local config, not committed as real secrets.
- `MSM261S4030H0` local portal now opens AP `SmartHealth-xxxxxx` only when WiFi is missing or cannot connect. The portal at `http://192.168.4.1` only allows WiFi SSID/password recovery and does not expose OTA password, backend host, device secret, ownership, or admin settings.
- `MSM261S4030H0` cloud control supports outbound backend WebSocket registration, heartbeat telemetry, audio binary frames, restart/status/lock/revoke/WiFi update commands, and cloud OTA download/verify/install/reboot commands.
- `MSM261S4030H0` LAN ArduinoOTA still exists only for development but is disabled unless `SMART_HEALTH_ENABLE_LAN_OTA=1` is explicitly provided.
- PlatformIO CLI path on this machine:
  - `C:\Users\baobe\.platformio\penv\Scripts\platformio.exe`

### Known Firmware Limits

- No production provisioning yet:
  - WiFi recovery portal exists, but pairing/claim still needs a QR claim handshake and secure device-secret provisioning.
  - no BLE provisioning
  - no secure NVS secret lifecycle
- MQTT telemetry/command plane integration exists only through backend hooks; the firmware currently uses WebSocket as the primary control/audio connection.
- WSS can be selected by backend TLS flag, but production CA validation/certificate pinning is not hardened yet.
- Cloud OTA exists with URL/checksum, but signed firmware, rollback, firmware release management, and physical-board update evidence are pending.
- No local buffering/resume for weak network.

## Installed Developer Tooling Status

- Global tooling registry: `C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md`; global `AGENTS.md` enforces canonical storage and post-install duplicate/local-copy audits.
- Chrome DevTools MCP: installed and enabled.
- CodeGraph MCP: installed and enabled.
- Codebase Memory MCP v0.8.1: installed and configured as `codebase-memory`; `smart-health-web` index smoke passed with 4,647 nodes and 19,239 edges stored outside the repo.
- Context7 MCP: configured; CLI/skill mode installed and logged in.
- Smart Health project skill: installed at `C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`; this replaces the old project-local `.ai_skills` folder.
- gstack Codex skills: installed under `~\.codex\skills\gstack-*`.
- code-reviewer skill: installed under `~\.agents\skills\code-reviewer`.
- Agent Reach v1.5.0 and its skill: installed. Six zero-configuration channels pass (`web`, `YouTube`, `RSS`, `Exa`, `V2EX`, basic Bilibili); GitHub CLI is installed but unauthenticated, and credentialed optional channels remain deliberately unconfigured.
- Selective third-party global skills under `~\.agents\skills`: `academic-research-suite`, `context-budget`, `strategic-compact`, filtered Matt Pocock skills, `impeccable`, and 11/13 Taste skills. Taste v1 and the generic v2 base are skipped because `gpt-taste` is the Codex-specific base; specialized Taste skills are loaded only when their style/workflow matches.
- 2026-06-23 routing/token-gate policy: every future Smart Health task first maps the request to the smallest relevant installed skill/tool, applies lightweight `context-budget` + `strategic-compact`, and loads full ECC skill bodies only for broad/long/tooling/audit/context-pressure work. The assistant should infer task skills/tools from the registry instead of waiting for the user to name them.
- Project-local duplicate cleanup: removed the Matt Pocock `qa`, `review`, and deprecated `design-an-interface` entry points plus the project-local Supabase duplicates; global gstack/frontend/Supabase plugin skills remain the canonical versions.
- 2026-06-23 full workspace audit: removed the remaining tracked `.ai_skills` copies from the active and older `Smart-Digital-Stethoscope` checkouts after confirming the global Superpowers marketplace payload. Replaced four stale `.ai-instructions.md` catalogs with short pointers to the global registry and Smart Health skill. The KLTN and PPT workspaces now keep only repo-specific instruction pointers.
- claude-mem: installed for Codex CLI; new Smart Health chats should best-effort check `http://localhost:37777` and start the worker in background with `npx claude-mem start` if it is not running.
- Bun: installed at `C:\Users\baobe\.bun\bin\bun.exe`.
- uv: installed and available for scientific/skill tooling.

## Last-Known Verification

Last KLTN report evidence run was on 2026-06-05. Follow-up cloud-first implementation checks were run on 2026-06-06, including the storage-backed OTA selector and Android cloud-status slice.

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm run check
npm run smoke:workspace-access
npm run smoke:storage
```

Result: backend check and workspace smoke passed on 2026-06-05, passed during the 2026-06-06 cloud-device slice, and passed again after the storage-backed OTA selector changes. Storage smoke also passed on 2026-06-06 after the firmware metadata/checksum change. A separate backend runtime smoke on temporary ports also passed on 2026-06-05: `/api/health` returned 200, WebSocket `/app` upgraded with `101 Switching Protocols`, and a 320-byte UDP audio packet was accepted/logged.

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm run build
```

Result: passed on 2026-06-05 and again on 2026-06-06 after the Devices page cloud-first rewrite and storage-backed firmware selector, with Vite bundle-size warnings for large export-related chunks.

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

Result: passed on 2026-06-05 for KLTN evidence, again on 2026-06-06 after Android cloud device status/live audio auth changes, and again on 2026-06-09 after the Android reality pass and FCM/token/preference wiring. Gradle installed Android SDK Build-Tools 36 and Android SDK Platform 36 during the earlier evidence run.

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleDebug
```

Result: passed. `app-debug.apk` installed and launched on emulator `Pixel_8_Pro_2`; screenshots were captured for login, personal signup, and facility-doctor signup on 2026-06-05. On 2026-06-09, emulator smoke verified direct `MainActivity` launch, phone-login UI, Android notification permission prompt, and no `FATAL EXCEPTION`/crash-buffer entries.

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

Result: passed on 2026-06-05 for KLTN evidence. On 2026-06-06, both `esp32-s3-devkitm-1` and `esp32-s3-ota` passed after the cloud-first firmware changes; current build size was about RAM 15.7%, flash 29.7%.

Physical serial/upload evidence is still pending. A 2026-06-05 `platformio device list` refresh only detected COM3/COM4 Bluetooth serial links, not COM6/ESP32-S3, so do not claim a same-day board upload/serial-monitor run from this evidence set.

KLTN report artifacts generated from this evidence set:

- `D:\Study\KLTN\docs\PL2 (3)-IEEE references.report-ready-20260605.docx`
- `D:\Study\KLTN\docs\PL2 (3)-IEEE references.final-evidence-20260605.docx`
- `D:\Study\KLTN\docs\report-evidence\2026-06-05\SUMMARY.md`

## What To Update Here After Future Changes

- New files/modules added.
- APIs changed or added.
- Env vars, ports, or commands changed.
- Mock/demo logic removed or added.
- Test/build results.
- Bugs fixed that future chats should not rediscover.
- Remaining limitations made better or worse.

## 2026-06-05 Web Admin Basic Function Completion

### Implemented

- `src/components/admin/ConfirmActionDialog.tsx` added as shared dangerous-action modal with loading/error states.
- Clinics, Packages, Storage, File Detail, Notifications, and Doctors no longer rely on browser `window.confirm`/`alert`; actions use modal/toast UI consistent with the admin dashboard.
- `AccountSettings.tsx` was rewritten to use real backend calls for profile save, avatar upload/remove-link, password change, session listing, session revoke, and logout-all-other-devices. Email is readonly because Firebase Auth owns identity.
- `Settings.tsx` was rewritten from mostly `defaultValue`/demo buttons to controlled state loaded/saved through `/api/settings`, with logo upload, Brevo email API/SMTP fallback test, SMS/Zalo webhook test, and disabled production-only controls with explicit reasons.
- `web-monitor/server.js` now includes Brevo email API support, `nodemailer` fallback, expanded default settings sections, public runtime settings status, `POST /api/settings/test-email`, `POST /api/settings/test-outbound`, extended `/api/me` profile fields, public session shaping, and admin-preferred demo fallback user selection.
- `src/lib/smart-health-api.ts` now supports the new profile/session/settings/test APIs and preserves raw file `Content-Type` for storage uploads.

### Verification

- Backend: `npm.cmd run check` passed.
- Backend syntax: `node --check server.js` passed.
- Web admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- UI audit: `rg -n 'window\.confirm|alert\('` over admin source returned no matches.
- API smoke on local backend: `/api/me` returned admin demo user, `/api/auth/sessions` returned sessions, `/api/settings` returned runtime email/webhook status, `test-email` returned clear 400 when email provider env is missing, and `test-outbound` returned clear 400 when webhook config is missing.

### Remaining Limits

- Real email sending now needs Brevo API env on Render Free or SMTP/App Password fallback on a host that allows SMTP; no secrets are hardcoded.
- SMS/Zalo paid-provider direct APIs are intentionally not integrated; current free/demo path is webhook only.
- 2FA, API key rotation, backup restore/check, and AI model update are visibly disabled until production backends/providers exist.
- Physical ESP32-S3 upload/serial evidence remains pending until hardware is connected.

## 2026-06-06 Login/Auth And Mojibake Stabilization

### Implemented

- Fixed the web admin login runtime mismatch by restarting the backend in production Firebase mode instead of demo mode. With production mode active, unauthenticated `/api/me` and `/api/settings` correctly return `401` instead of demo admin data.
- Added automatic token clearing in `src/lib/smart-health-api.ts` when API JSON/blob requests receive `401`, so stale localStorage tokens do not keep the admin UI stuck on invalid-session errors.
- Repaired actual mojibake strings in the admin source pages affected by the basic-functions slice: Clinics, Doctors, Notifications, Packages, Storage, and FileDetailDialog. The backend patient-profile 404 Vietnamese string was also repaired.
- Login form now has proper `htmlFor`/`id`/`name`/`autocomplete` attributes for email and password, removing Chrome accessibility/form issues.

### Verification

- Backend: `npm.cmd run check` passed.
- Web admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- Auth runtime smoke: backend log shows `Auth mode: production; Firebase auth: enabled`; `/api/health` returns 200; unauthenticated `/api/me` and `/api/settings` return 401.
- Browser smoke: `http://127.0.0.1:5174/login` renders correct Vietnamese text. Submitting fake credentials calls Firebase `accounts:signInWithPassword` and shows `Email hoặc mật khẩu không đúng.`; no backend invalid-session error appears.
- UI audit: admin source still has no `window.confirm`/`alert(` matches. UTF-8 mojibake scan has no real hits; the only remaining match is the intentional replacement-character guard in `error-messages.ts`.

### Remaining Limits

- A successful real admin login still requires a valid Firebase admin account/password. This was not tested with real credentials in the automated smoke.
- Authenticated browser smoke for account save/avatar/session/settings/delete modals still needs a real admin session or scripted Firebase token.

## 2026-06-06 Clinic Delete Link-Count Fix

### Implemented

- Fixed workspace usage counting so doctors are counted from either `role === "doctor"` or `requestedRole === "doctor"` instead of only `requestedRole`.
- `DELETE /api/admin/clinics/:id` now returns a structured `WORKSPACE_IN_USE` 409 with `details` for linked accounts, doctors, patients, devices, total, and short samples.
- Clinic delete modal now shows a precise breakdown such as `4 tài khoản (1 bác sĩ), 4 bệnh nhân, 0 thiết bị` instead of the vague `4 tài nguyên liên kết`.
- Web admin API errors now preserve `status` and raw backend `payload`, allowing modal/toast UI to display backend conflict details.

### Verification

- Backend: `npm.cmd run check` passed.
- Web admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- Local JSON DB check showed `org_default_clinic` / `Smart Health Clinic` still has 4 linked users and 4 linked patients, so backend correctly blocks deletion until those links are transferred or removed.

## 2026-06-06 Workspace Admin Role Separation

### Implemented

- Backend production Firebase auth now supports real scoped roles from custom claims: `workspace_admin`, `workspace_owner`, `doctor`, `nurse`, `technician`, `billing`, and `viewer`. `workspace_admin` is no longer treated as invalid during `/api/me` upsert.
- Added `scripts/createWorkspaceAdmin.js` and `npm run firebase:create-workspace-admin` to create/update a Firebase workspace admin, set claims, upsert JSON organization/user/membership, and seed a demo doctor/patient/device.
- Added platform-admin UI/API account creation: Web Admin sidebar exposes `Hành động quản trị`; inside it, `Tạo tài khoản admin` calls `POST /api/admin/admin-users`, creates a Firebase Auth user, sets admin/workspace-admin custom claims, saves backend user/membership through repositories for JSON/Postgres parity, rejects duplicate emails, and writes `admin.user.create` audit metadata.
- Global package APIs are platform-only (`platform.packages.manage`) for list/create/update/delete. Workspace users with billing capability cannot manage global service packages.
- Overview stats, clinics, doctors, patients, devices, storage, notifications, audit, and settings now behave as workspace-scoped for the browser-smoked `workspace_admin`.
- `/api/settings` now returns effective merged settings plus a `scope` object. Platform admins write global settings; workspace admins write `organization.settings`.
- Web admin role badge/menu gating now distinguishes `Quản trị toàn hệ thống` from `Admin bệnh viện`. Workspace admins see their hospital name and do not see platform menu items such as packages, clinic management, doctor approval, and Firebase sync.
- Patient list now supports `primaryDoctorId`/`doctorName`, so seeded workspace patients show `Bác sĩ Demo Workspace` instead of a raw user ID.

### Verification

- Backend: `npm.cmd run check` passed.
- Backend workspace smoke: `npm.cmd run smoke:workspace-access` passed.
- Web admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- 2026-06-08 admin-account UI/API change: `npm.cmd run check` in `web-monitor`, `npm.cmd run build`, and `npm.cmd run build:firebase` in Web Admin all passed.
- API smoke with Firebase account `workspace.admin.demo@smarthealth.test` returned role `workspace_admin`, workspace `Bệnh viện Demo Workspace`, 1 scoped clinic, 1 scoped doctor, 1 scoped patient, 1 scoped device, workspace settings scope, and 403 for `/api/admin/packages` and `/api/admin/doctor-requests`.
- Browser smoke at `http://127.0.0.1:5174` showed `Admin bệnh viện`, `Bệnh viện Demo Workspace`, scoped sidebar, direct `/packages` and `/doctor-approval` access-denied screens, `/settings` title `Cài đặt bệnh viện`, and scoped Doctors/Patients/Devices tables.

### Remaining Limits

- The workspace admin password used for smoke is a local demo credential and should be rotated before any public deployment.
- Workspace admin browser smoke covers core scoping and route gates; deeper CRUD-by-role E2E scripts still need to be automated.
- The legacy `firebase:create-workspace-admin` smoke script is still JSON-oriented, but the new Web Admin account-creation endpoint uses repository saves for JSON/Postgres parity.

## 2026-06-06 Settings/Account Unlocked Demo Functions

### Implemented

- Backend `/api/me` now persists `notificationPreferences`; `POST /api/me/2fa` enables/disables app/SMS demo 2FA state and generates recovery codes for the current user.
- Backend `/api/settings/backup-check` records scoped JSON/storage backup status for platform or workspace settings.
- Backend `/api/settings/api-keys`, `/api/settings/api-keys/:id/rotate`, and `DELETE /api/settings/api-keys/:id` create, rotate, and revoke masked demo API keys. Workspace admins only see and manage workspace-scoped keys; platform keys are filtered out of workspace settings.
- Backend `/api/settings/ai/check-update` and `/api/settings/ai/update` implement a local-demo AI model metadata update instead of leaving the UI button disabled.
- Storage image records now expose `previewUrl`; avatar/logo upload via the `avatars` bucket can be linked to `/api/me` and `/api/settings.branding`.
- Web admin Account Settings now has usable 2FA, notification preference, avatar, and session actions. System Settings now has usable backup check, API key, AI update, and logo actions.

### Verification

- Backend: `npm.cmd run check` passed.
- Backend workspace smoke: `npm.cmd run smoke:workspace-access` passed.
- Web admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- Authenticated API smoke with the Firebase workspace-admin account passed: `/api/me`, notification preferences patch/restore, 2FA enable/disable, avatar upload/download/link/clear, logo upload/settings/restore, backup check, API key create/rotate/revoke, and AI update.
- Browser smoke at `http://127.0.0.1:5174` showed Account and Settings pages under `Admin bệnh viện`; Settings security tab shows only workspace API keys after the platform-key filter. Console had only the known Vite `stream.Readable` browser-compatibility warning.
- Source audits passed: no admin `window.confirm`/`alert(` matches and no mojibake hits in backend `server.js` or admin `src` except the intentional replacement-character guard.

### Remaining Limits

- 2FA is demo state only; real OTP/TOTP verification and SMS provider delivery are still production work.
- Backup check verifies local JSON/storage scope; real cloud backup restore is still production work.
- API keys are masked local-demo settings records, not gateway-enforced production credentials yet.
- AI model update changes local metadata only; no cloud model download/worker pipeline is implemented yet.

## 2026-06-06 KLTN Product-Readiness Hardening

### Implemented

- Firmware `MSM261S4030H0/src/main.cpp` no longer blocks forever when WiFi is missing or cannot connect. It loads WiFi config from ESP32 NVS (`Preferences`) with build flags as fallback.
- Added ESP32 WiFi recovery flow using AP `SmartHealth-<suffix>` at `http://192.168.4.1`. The page collects only WiFi SSID/password, saves them, and restarts the board.
- Backend host, device id, device secret, firmware, ownership, and admin actions are managed through backend/Web Admin/provisioning instead of the ESP local page.
- WiFi connection now has a finite timeout. Missing config and WiFi failure route to WiFi recovery portal instead of infinite blocking loops.
- Cloud audio/control now uses outbound WebSocket/WSS as the primary path, with UDP audio kept as optional development fallback.
- Android release builds now require a real HTTPS `SMART_HEALTH_BASE_URL` Gradle property and reject local/emulator backend URLs. Debug builds still default to `http://10.0.2.2:3000` for emulator development.
- Web admin now has `npm run build:product`, which validates production Firebase mode plus HTTPS non-local backend URLs before building. The admin API client also rejects local backend URLs in production runtime unless `VITE_SMART_HEALTH_ALLOW_LOCAL_BACKEND=true` is explicitly set for an internal/local-only build.

### Verification

- Backend: `npm.cmd run check` passed.
- Backend workspace smoke: `npm.cmd run smoke:workspace-access` passed.
- Web admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- Web admin product guard: `npm.cmd run build:product` failed intentionally against `.env.local` because it points to `http://localhost:3000`; the same command passed when `VITE_SMART_HEALTH_BASE_URL=https://api.smart-health.example.com` and `VITE_SMART_HEALTH_API_BASE_URL=https://api.smart-health.example.com/api` were supplied through the shell.
- Android debug: `.\gradlew.bat :app:compileDebugKotlin` passed.
- Android release guard: `.\gradlew.bat :app:assembleRelease` without `SMART_HEALTH_BASE_URL` failed intentionally with a clear required-URL error.
- Android release build: `.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com` passed. Existing Android deprecation warnings remain non-blocking.
- Firmware: `C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run` passed for `MSM261S4030H0`; RAM 14.4%, flash 22.9%.
- Hardware port check: PlatformIO saw COM3/COM4 Bluetooth serial only, so real ESP32-S3 flash and serial-monitor evidence still needs the board connected.

### Remaining Limits

- Real deployment still needs a hosted HTTPS backend domain, Firebase service account/runtime env, production data backend choice, and object storage credentials if not using local JSON/storage.
- Real firmware portal behavior still needs on-device smoke after the ESP32-S3 appears as a serial device.
- Android release APK is buildable with a real backend URL, but signing/release distribution credentials are still outside source control and must be supplied by the deployment machine.

## 2026-06-06 Cloud Device Control And OTA

### Implemented

- Firmware now persists WiFi/backend/device runtime fields in ESP32 NVS namespace `smart-health`, with build flags as fallback.
- The local ESP portal is WiFi recovery only: AP `SmartHealth-<suffix>` at `http://192.168.4.1` saves SSID/password and does not expose backend host, device secret, owner, OTA password, browser firmware upload, restart, or admin settings.
- Firmware opens outbound backend WebSocket/WSS, sends heartbeat telemetry and audio binary frames, receives cloud commands, and emits device/OTA events.
- Firmware handles cloud commands including restart, WiFi status, device lock/revoke, WiFi update, and `ota.update`.
- Cloud OTA downloads firmware from HTTP/HTTPS URL, verifies SHA-256 when a checksum is provided, writes the OTA partition, reports progress/failure, and reboots on success.
- Backend WebSocket handling registers ESP devices by `deviceId`/secret, updates telemetry, stores device events, sends backend commands, and keeps online/offline status heartbeat-derived.
- Web Admin Devices now uses backend cloud as the management surface and no longer presents local `.local/admin` as normal operation.
- LAN ArduinoOTA and PlatformIO `esp32-s3-ota` remain available only for development when `SMART_HEALTH_ENABLE_LAN_OTA=1` is explicitly set; they are not the product OTA path.

### Verification

- Firmware default env: `C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1` passed; RAM 15.7%, flash 29.7%.
- Firmware OTA env: `C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-ota` passed.
- Backend: `npm.cmd run check` passed.
- Backend workspace smoke: `npm.cmd run smoke:workspace-access` passed.
- Web Admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- Source audits passed for the rewritten Devices/ConfirmActionDialog files: no mojibake hits, and admin source still has no `window.confirm`/`alert(` matches.

### Remaining Limits

- A new ESP32-S3 still requires one initial wired flash or factory provisioning image. OTA cannot work before OTA-capable firmware is present.
- Real cloud heartbeat/audio/OTA still need on-device smoke once the board is connected and configured.
- Production security should add claim-code/QR provisioning, secure NVS/device-secret lifecycle, certificate validation, signed firmware, and rollback.

## 2026-06-06 Production Readiness Checker And Third-Party Setup

### Implemented

- Added backend production readiness checks for production auth mode, disabled demo auth, Firebase Admin, public HTTPS backend URL, CORS, Postgres, Redis, S3/R2 object storage, HTTPS storage endpoint, PHI encryption key, rate limit, Brevo email API/SMTP fallback, SMS/Zalo webhook, MQTT/TLS, cloud OTA public URL, firmware signing/rollback warning, Web Admin product build, and Android release build.
- Added CLI commands `npm.cmd run check:production` and `npm.cmd run check:production:strict`.
- Added platform-only readiness API `GET /api/v1/settings/production-readiness`.
- Added Web Admin Settings tab `Triển khai` to render deployment status and blockers from backend readiness.
- Expanded `web-monitor\.env.example` with production env placeholders for third-party services and secrets.
- Added `D:\Study\KLTN\docs\SMART_HEALTH_THIRD_PARTY_SETUP.md` with setup steps and official documentation links for Firebase, Postgres, R2/S3, Brevo email API/SMTP fallback, SMS/Zalo webhook, Android release, and ESP provisioning.
- Rewrote `SMART_HEALTH_THIRD_PARTY_SETUP.md` as a detailed Vietnamese step-by-step checklist from Firebase project creation through backend/domain, Postgres, R2/S3, email outbound, SMS/Zalo webhook, Web Admin, Android release, ESP first flash, cloud OTA, and final readiness checks.
- Updated root `.gitignore` to keep production secrets/local config out of the public GitHub repo, including `.env.*`, Firebase service account JSON, `firebase/`, `google-services.json`, `.env.local`, `.env.production`, and `.dev.vars`.
- User deployed backend to Render on 2026-06-06. Public backend URL is `https://smart-health-api-xj0a.onrender.com`; `/api/health` returned `ok: true` with Render `httpPort: 10000`. Current Render data backend was started with temporary JSON mode until Neon/Postgres is configured.
- User completed Neon Postgres setup on 2026-06-06, set Render `DATA_BACKEND=postgres`, ran migration, and confirmed `https://smart-health-api-xj0a.onrender.com/api/health` still returns successfully. Production DB setup is now connected at the infrastructure level; app-level Postgres smoke and seeded admin/workspace data should still be verified after storage/env setup.
- User chose Supabase to replace Neon/R2 direction. Supabase project `smart-health-production` was created with project id `mahvymycnxszvuhlycwp`, region `ap-northeast-2`, and Render `DATABASE_URL` was updated to the Supabase direct Postgres connection. Migration was completed by the user; next provider step is Supabase Storage S3-compatible credentials.
- User created Supabase Storage bucket `smart-health-production`, enabled S3-compatible storage, created an access key, set Render S3 env, and confirmed Render `/api/health` still works. `npm run smoke:storage` has not been run yet because Render shell/local secret execution is still pending.
- Supabase Storage local smoke initially failed with AWS SDK deserialization error while uploading a stream. `src/storageAdapter.js` now sends `ContentLength` and uploads `putFile` as a buffer instead of a streaming body for S3-compatible providers that do not handle chunked streaming exactly like AWS S3.
- User installed Supabase agent skills with `npx skills add supabase/agent-skills`; Supabase MCP/plugin is available. Plugin `list_projects` confirmed the actual project ref is `mahvymyncxszvuhlycwp` (database host `db.mahvymyncxszvuhlycwp.supabase.co`), not `mahvymycnxszvuhlycwp`. Any Supabase Storage S3 endpoint must use this exact ref.
- Supabase Storage smoke passed after correcting the project ref and S3 credentials. Render deploy then failed because `DATABASE_URL` used Supabase Direct connection to IPv6 (`connect ENETUNREACH ...:5432`). Render needs Supabase Session/Transaction Pooler IPv4 connection string instead of Direct connection.
- User switched Render `DATABASE_URL` to Supabase pooler and redeployed. Latest pushed commit is `e56ffad Fix Supabase S3 storage configuration`; remote `https://smart-health-api-xj0a.onrender.com/api/health` returned `ok: true` on 2026-06-07. Next step is Web Admin production env/build/deploy against this Render backend.
- 2026-06-07 platform-admin login fix: `normalizeFirebaseRole()` now treats raw Firebase custom claims `role=admin` and `role=platform_admin` as backend role `admin` before workspace-role normalization. This fixes platform/system admin Firebase accounts being shown as Workspace Portal / hospital admin in Web Admin. Local Firebase Admin inspection confirmed `nguyengiabao100624@gmail.com` has UID `YOPbEgWu4pfRjMsbb8X5zOFBwUx1` and custom claims `role=admin`, `smartHealth.role=admin`. Supabase `public.users` was empty during inspection, so after redeploy the next Firebase login should create/self-heal the backend user row as `role=admin`.
- User confirmed after redeploy/sign-in that the platform admin account now logs in correctly and no longer opens the hospital-admin Workspace Portal view.
- 2026-06-07 production RBAC persistence fix: Supabase `users_role_check` still allowed only `admin`, `doctor`, and `patient`, so workspace roles could not persist to Postgres. Added/applied `004_expand_user_roles.sql` for `workspace_admin`, `workspace_owner`, `nurse`, `technician`, `billing`, and `viewer`. Added/applied `005_seed_default_organization.sql` so `org_default_clinic` exists before Firebase-auth users are upserted with an `organization_id` foreign key.
- Added `npm.cmd run smoke:production-roles`, which creates/updates Firebase smoke accounts for platform admin and workspace admin, signs in through Firebase REST, calls the Render backend `/api/auth/firebase` and `/api/me`, and asserts platform vs workspace capabilities. The smoke passed against `https://smart-health-api-xj0a.onrender.com`; Supabase confirmed persisted roles `admin` and `workspace_admin`.

### Verification

- Backend: `npm.cmd run check` passed after adding the readiness checker.
- Backend: `npm.cmd run check` passed after the 2026-06-07 platform-admin Firebase role normalization fix.
- Backend: `npm.cmd run check` passed after adding migrations and `scripts/productionRoleSmokeTest.js`.
- Backend readiness: `npm.cmd run check:production` ran successfully and correctly reported `BLOCKED` for the current local/demo env.
- Backend workspace smoke: `npm.cmd run smoke:workspace-access` passed.
- Backend storage smoke: `npm.cmd run smoke:storage` passed.
- Backend production role smoke: `npm.cmd run smoke:production-roles` passed using Firebase Auth and the Render backend.
- Web Admin: `npm.cmd run build` passed after adding the Settings deployment tab.
- Web Admin: `npm.cmd run build:product` passed with production env pointing at the Render backend; Vite still warns about large chunks.
- Unicode/source audit: no unexpected mojibake hits in active backend/admin/docs files; only the old report-evidence mojibake backup and the intentional guide search pattern matched.
- Browser smoke at `http://127.0.0.1:5174/settings` with the current unauthenticated/limited session rendered the access-denied state without crashing; backend calls returned `401` as expected. Screenshot: `D:\Study\KLTN\docs\report-evidence\2026-06-05\screenshots\web-admin-settings-readiness-access-gated-20260606.png`.

### Remaining Limits

- `check:production:strict` cannot pass until the user supplies real production setup: Firebase Admin credentials, HTTPS backend domain, Postgres `DATABASE_URL`, S3/R2 credentials, `PHI_ENCRYPTION_KEY`, and deployment-specific Web Admin/Android URLs.
- Brevo email, SMS/Zalo webhook/provider accounts, Redis, MQTT, signed firmware, and Android release signing remain provider/account setup items rather than source-code-only tasks.

## 2026-06-08 GitHub Actions And Next-Day Setup Runbook

### Implemented

- Added root workflow `.github/workflows/smart-health-ci.yml` so GitHub checks backend syntax, workspace access smoke, production readiness report, Web Admin Firebase build, Android debug compile, and ESP32-S3 normal/OTA firmware builds on push, pull request, or manual dispatch.
- Added root workflow `.github/workflows/deploy-web-admin.yml` for manual Firebase Hosting deploy of `https://shcare-admin.web.app` from GitHub Actions. It requires GitHub repository secrets `FIREBASE_SERVICE_ACCOUNT_JSON`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
- Added `smart-health-android/app/google-services.ci.json`, a dummy compile-only Firebase config copied by CI when the real ignored `google-services.json` is absent.
- Added backend script `npm.cmd run smoke:public-deployment` to check the current public Render backend and Firebase Hosting Web Admin without any secrets.
- Updated Web Admin platform-admin chrome so the sidebar footer no longer shows the legacy default workspace `Phòng khám: Smart Health Clinic` or the platform scope subtitle. Platform admins now see a shorter `Quản trị hệ thống` badge in the sidebar; the topbar scope context remains unchanged.
- Added `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md`, a Vietnamese step-by-step runbook for GitHub Actions, Render env, Supabase Postgres/S3, Firebase Hosting, admin account creation, Brevo email/SMS/Zalo config, Android build, ESP first flash, and cloud OTA smoke.
- Rewrote `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` into a fully accented, more detailed Vietnamese guide after the initial ASCII/no-accent draft was hard to read.

### Verification

- Backend: `npm.cmd run check` passed.
- Public deployment smoke: `npm.cmd run smoke:public-deployment` passed against `https://smart-health-api-xj0a.onrender.com` and `https://shcare-admin.web.app`.
- Setup guide UTF-8 audit: the guide heading reads `# Smart Health - Hướng Dẫn Setup Ngày Mai`, has 491 lines, and no longer contains old no-accent markers such as `Huong Dan`, `Buoc`, `Khong`, `Neu`, or mojibake markers.
- Backend workspace smoke: `npm.cmd run smoke:workspace-access` passed.
- Backend readiness report: `npm.cmd run check:production` ran and correctly reports local env as `BLOCKED` because local PowerShell lacks production secrets/env.
- Web Admin: `npm.cmd run build:firebase` passed against `https://smart-health-api-xj0a.onrender.com` with CI-safe Firebase web env placeholders.
- Web Admin platform-admin chrome fix: `npm.cmd run build:firebase` passed after the sidebar/topbar scope label change.
- Android: `.\gradlew.bat :app:compileDebugKotlin` passed.
- Firmware: `platformio run -e esp32-s3-devkitm-1` and `platformio run -e esp32-s3-ota` both passed.
- GitHub Actions: `Smart Health CI` passed on commit `d54855b` with backend, Web Admin, Android, and ESP32-S3 firmware jobs successful.

### Remaining Limits

- GitHub CI must be observed after pushing because local validation cannot execute GitHub-hosted Actions.
- Manual GitHub deploy workflow cannot succeed until the user adds Firebase GitHub secrets.
- Physical ESP32-S3 heartbeat/audio/OTA evidence still requires the board and real device credentials.

## 2026-06-08 Admin Account Management And Account Security Fix

### Implemented

- Added a dedicated Web Admin page `/admin-accounts` under `Hành động quản trị` for platform admins with `platform.users.manage`.
- The new page can list admin accounts and perform create, edit, lock/unlock, reset-password, and delete actions through backend APIs.
- Account Settings avatar handling now uses dedicated `/api/me/avatar` upload/download/delete endpoints instead of the generic storage admin flow, so avatar changes work from the profile UI.
- Password change in Account Settings now uses Firebase re-authentication plus `updatePassword` in production, then confirms the update through backend `/api/me/password`.
- Backend `PATCH /api/admin/admin-users/:id` now only treats role/workspace as changed when the actual values differ, so editing your own name/title/phone no longer trips the self-role guard.

### Verification

- Backend `npm.cmd run check` passed.
- Web Admin `npm.cmd run build` passed.
- Web Admin `npm.cmd run build:firebase` passed and prerendered `/admin-accounts`.

### Remaining Limits

- Browser smoke still needs a real authenticated platform-admin session to verify the new admin-account page, avatar upload, and password change end to end.
- The platform admin still cannot self-change role/workspace or lock/delete the current login account.

## 2026-06-08 Avatar, Password Reset, And Font Cleanup

### Implemented

- Replaced the remaining visible Storage mojibake text with proper Vietnamese: `Hoạt động gần đây` and `Gần đây`.
- Normalized backend user-facing permission/error strings in `server.js` from old no-accent copy to Vietnamese with accents across the account/admin-account/storage/workspace/doctor/settings/export/sharing paths.
- Added Firebase forgot-password delivery through `sendPasswordResetEmail` on the Web Admin Forgot Password page. The previous frontend-only timeout is gone.
- Added explicit Firebase Auth error mapping for `auth/unauthorized-domain` and `auth/unauthorized-continue-uri`, so Forgot Password now shows the correct setup problem when `shcare-admin.web.app` is missing from Firebase Authentication authorized domains instead of incorrectly reporting an expired login session.
- Hardened account avatar storage for production S3/Supabase Storage: backend CORS now accepts `X-File-Name`, S3 uploads include `ContentLength`, `/api/me/avatar` stores durable `avatarStorage` metadata in the user profile, and avatar download is served through the backend from object storage instead of redirecting to a signed URL.
- Avatar update/removal now deletes or replaces the old avatar object when possible, while hiding storage object metadata from `publicUser`.
- Password-change notifications now use correct Vietnamese text and include `userId`/`organizationId` metadata so the notification is scoped to the current user.
- Email test now prefers Brevo API over HTTPS on Render Free, with SMTP/Gmail kept as fallback. The SMTP fallback still has bounded Nodemailer timeouts, trims Gmail App Password spacing, and converts common Gmail failures into actionable 400 responses instead of a generic backend 500.

### Verification

- Backend `npm.cmd run check` passed.
- Web Admin `npm.cmd run build` passed.
- Web Admin `npm.cmd run build:firebase` passed and prerendered `/forgot-password` and `/account`.
- Backend `npm.cmd run check:production` ran after the Brevo readiness update; local shell still reports `BLOCKED` only because production env/secrets are not loaded, and the outbound check now labels `Email outbound Brevo API / SMTP fallback`.
- API smoke with a temporary demo admin token verified `POST /api/settings/test-email` returns clear `400 EMAIL_NOT_CONFIGURED` with missing `BREVO_API_KEY, BREVO_FROM_EMAIL` when Brevo env is absent.
- Browser smoke on local `/forgot-password` passed; the page renders proper Vietnamese text and was not submitted to avoid sending a real reset email.
- Source audit passed: no mojibake-pattern hits in `smart-health-admin\thiết kế giao diện\src`, `web-monitor\server.js`, or `web-monitor\src`; remaining `??` matches are valid JavaScript nullish-coalescing operators.

### Remaining Limits

- Real password-reset email delivery still depends on Firebase Console setup: Email/Password provider enabled, password-reset template configured as desired, and `shcare-admin.web.app` authorized.
- Brevo test email still depends on correct Render env and Brevo sender setup: `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, and `BREVO_FROM_EMAIL` must be set, and the sender email must be verified in Brevo. Gmail SMTP remains fallback only when the host permits SMTP.

## 2026-06-08 Platform Admin Notification Email Fanout

### Implemented

- Every backend-created Web Admin notification now queues an outbound email to all active platform/system admin accounts only. Hospital/workspace admin recipient fanout is intentionally left for a later policy pass.
- Notification email delivery uses the same outbound provider stack as Settings email test: Brevo Transactional Email API over HTTPS first on Render Free, SMTP/Gmail fallback only when the host permits SMTP.
- Added a branded Smart Health HTML email template with severity badge, message card, metadata table, timestamp, workspace/user context, and CTA link to `WEB_ADMIN_URL/notifications`.
- Added metadata sanitization before email rendering so password/token/secret/API-key-like fields are not included in notification emails.
- Added duplicate-dispatch protection by `notification.id`, so old flows that pass through both JSON notification state and repository persistence do not email the same event twice.
- Added `NOTIFICATION_EMAIL_ENABLED=false` emergency switch and `WEB_ADMIN_URL` env for the email CTA target.

### Verification

- Backend `npm.cmd run check` passed after the notification email fanout change.

### Remaining Limits

- Real delivery still requires Render env `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, optional `BREVO_FROM_NAME`, and `WEB_ADMIN_URL=https://shcare-admin.web.app`.
- Email fanout currently targets platform admins only. Workspace/hospital admin notification email policy, unsubscribe/preference handling, retry queue, and per-recipient delivery records remain future work.

## 2026-06-12 Android Core MVP Status

### Implemented

- Android debug builds now default to Render API `https://smart-health-api-xj0a.onrender.com`, fixing the common `Không thể kết nối máy chủ` startup failure when local `127.0.0.1:3000` is not running.
- `SplashScreen` now performs backend health preflight plus Firebase session restore and backend auth before routing by user role/status.
- `MainActivity` no longer requests notification permission on first launch. Notification Settings asks only after login/user action with a Vietnamese pre-prompt.
- Login/signup/verification/device/monitoring/records copy was cleaned up to remove visible fake placeholders, `demo` wording, raw technical share IDs, and `backend cloud` phrasing from the Android core user path.
- Backend exposes authenticated `GET /api/share-targets?q=` for doctor/workspace share recipients, scoped by the current user role/workspace.
- Android Medical Records uses a searchable share-target picker and calls the existing patient share API with selected doctor/workspace IDs.

### Verification

- Backend syntax check: `npm.cmd run check` passed in `D:\Study\KLTN\smart-health-embedded\web-monitor`.
- Android Kotlin compile: `.\gradlew.bat :app:compileDebugKotlin` passed in `D:\Study\KLTN\smart-health-android`.
- Android debug APK: `.\gradlew.bat :app:assembleDebug -PSMART_HEALTH_BASE_URL=https://smart-health-api-xj0a.onrender.com` passed.
- Android release APK: `.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://smart-health-api-xj0a.onrender.com` passed and produced `app-release-unsigned.apk`.
- Render health: `https://smart-health-api-xj0a.onrender.com/api/health` returned `ok: true`.
- Emulator smoke on `emulator-5554`: installed debug APK, cleared app data, launched `com.example.smart_health_android/.MainActivity`, verified login screen opens without startup notification permission dialog, signup screen renders with cleaned placeholders, doctor-clinic signup shows selectable clinic/specialty fields, and crash buffer stayed empty.

### Remaining Limits

- Full verified-account Android QA still needs a real Firebase smoke account for end-to-end profile save, avatar, device pairing, scans, record detail, share picker, notifications, and settings.
- Physical ESP32-S3 heartbeat/audio/OTA smoke remains separate hardware evidence work.
- SMS phone login remains intentionally hidden until a real SMS/Zalo provider is configured.

## 2026-06-24 Smart Health Web UI Status

### Implemented

- Repaired the public header stacking issue in light mode: it remains visible while scrolling, starts transparent, and adopts the translucent surface only after `is-scrolled` is active.
- Stabilized public desktop menus with a bridged, React-state-controlled hover/focus interaction so product and solution child links no longer collapse before selection.
- Expanded the homepage with a cinematic hero media layer, operational proof cards, and a device-to-portal data handoff panel; added a consistent restrained surface treatment for the other public pages.
- Compacted authentication layouts for desktop and restored the full-width single-column mobile grid, preventing the registration form from overflowing or reserving an empty column.

### Verification

- `bunx prettier --write src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx src/web-styles/signal-horizon.css` passed.
- `bunx eslint src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx` and `bun run build` passed.
- Chrome DevTools verified `/`, `/login`, and `/register` at 1440x1000 light/dark and 500x900 mobile. The UI console can show `/api/me` `ERR_CONNECTION_REFUSED` when `web-monitor` is not running; no new UI runtime error was observed.

## 2026-06-24 Public Web Visual Release

### Implemented

- The home hero now plays `MẪU UI UX/bacsi.mp4` directly. The opaque white/black wash layer is removed. A second masked video layer provides blur only around the outer edges, keeping the doctor/child center clear.
- Header behavior is deterministic in code: at the top it has no background and `backdrop-filter: none`; after 16px of scroll it becomes a low-opacity, rounded water-glass surface with 44px blur.
- Home content enters on viewport arrival with directional left/right/up motion, blur-to-clear, opacity, scale, and stagger. Product, pricing, and contact use scroll-timeline animation where supported. All motion remains disabled for `prefers-reduced-motion` users.
- Firebase Hosting deployment completed for `https://shcare.web.app` (site `shcare`, release version `7bafbc088d49e939`).

### Verification

- `bunx eslint src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx` passed.
- `bun run build` and production Firebase build passed; `bacsi-CH0Km87A.mp4` is present in the production assets.
- Production Chrome check confirmed two autoplaying hero video layers, masked edge blur, no wash node, transparent/no-blur top header, 44px-blur scrolled header, and no horizontal overflow.

## 2026-06-25 Public Web Fit And Motion Follow-up

### Implemented and deployed

- Public scroll reveals now stay observed and switch between `pending` and `visible` on viewport entry/exit, making desktop scroll animation visibly repeat when a section comes back into view.
- Home page Motion reveals now use `once: false`, a lower viewport threshold, and a longer ease duration.
- The final `signal-horizon.css` layer removes the boxy hero trust-chip backgrounds, locks the public/auth palette to teal/clinical colors instead of purple, makes the scrolled header more transparent with stronger blur, reduces hero preview opacity/blur, increases desktop reveal offsets, reduces mobile reveal offsets, and tightens mobile hero/preview/auth sizing.

### Verification

- `bunx prettier --write src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx src/web-styles/signal-horizon.css` passed.
- `bunx eslint src/app/context/PublicMotionContext.ts src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx` passed.
- `bun run build` passed. The existing Vite/TanStack client chunk warning remains.
- `bun run build:firebase` passed and produced `dist-firebase` assets including `index-BSdxiKdV.css`, `index-CfcxVhIe.js`, and `bacsi-CH0Km87A.mp4`.

### Remaining Limits

- Firebase Hosting deploy was attempted but did not complete in the current Codex sandbox. `npx firebase-tools@13.35.1` stalled on dependency fetch retries, while the cached Firebase CLI could not authenticate because sandbox network/ACL blocked Google OAuth/configstore access. The live domain should be considered unchanged from the last confirmed release `7bafbc088d49e939` until deploy is run from a normal local terminal or CI.

## 2026-06-30 Public Web Mobile/Scroll/Motion And Portal Status

### Implemented and deployed

- Fixed the mobile homepage proof-card layout shown in the user screenshot. Phone widths now reset the public proof/product/plan/FAQ/contact/operating/workflow grids and card spans to one column, preventing implicit grid columns from squeezing text into a vertical strip.
- Added route scroll reset in `PublicLayout`, `AuthLayout`, and `PortalLayout`; navigation from a scrolled route now starts the next route at `scrollY=0`.
- Reworked homepage reveal animation to use a local IntersectionObserver + CSS state instead of only `motion/react whileInView`. The desktop state moves from `pending` translate/blur/opacity to `visible`; mobile uses vertical-only reveal offsets so cards do not slide horizontally off the phone viewport.
- Public motion preference is consistent: the default follows OS `prefers-reduced-motion`, while the public `Hiệu ứng` toggle persists `shc-public-motion=enabled/reduced` and changes `data-shc-motion` so the CSS behavior matches the UI.
- Hardened light/dark contrast for public, auth, and portal text/input states. Removed remaining over-tight/gradient heading artifacts from the final public CSS layer.
- Added portal backend status wiring: `smartHealthApi.portalStatus()` calls `/api/portal/status`; `PortalLayout` polls it and renders a compact backend status pill in the topbar. Backend `handlePortalApi` returns service/mode/workspace/scoped counts/status payload for authenticated portal users.
- Deployed `https://shcare.web.app` via Firebase Hosting target `webapp`. Release: `projects/162993928259/sites/shcare/versions/cc264fa1be69d04a`, live release `1782759036395000`.

### Verification

- Web: targeted ESLint passed for `HomePage.tsx`, `PublicLayout.tsx`, `AuthLayout.tsx`, `PortalLayout.tsx`, and `smart-health-api.ts`.
- Web: `bun run build` passed. At that point the large client chunk warning still remained; it was resolved later on 2026-06-30 by the route lazy-split release below.
- Web Firebase: `bun run build:firebase` passed and produced `dist-firebase/assets/index-DftUVpnd.css`, `dist-firebase/assets/index-DNVNrv9k.js`, and `bacsi-CH0Km87A.mp4`.
- Browser QA: local and live mobile 390px checks confirmed `scrollWidth=clientWidth`, proof cards full-width, route navigation scroll reset, mobile auth/register fit, and desktop reveal state settling to opacity `1`, transform `0`, blur `0`.
- Backend: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, and `npm.cmd run smoke:repositories` passed.
- Live smoke: `https://shcare.web.app/`, `https://shcare.web.app/login`, and `https://smart-health-api-xj0a.onrender.com/api/health` returned HTTP 200.

### Remaining Limits

- `npm.cmd run check:production` still reports local/demo env as `BLOCKED` without production envs: Firebase Admin/service account, public backend URL, Postgres, object storage, PHI encryption, Brevo/SMS/Zalo/MQTT, and related provider secrets.
- Full authenticated portal E2E still needs real doctor/clinic accounts to verify mutations and API error states beyond unauthenticated/public smoke.
- Bundle splitting was resolved later on 2026-06-30 by restoring the web manifest/config and lazy-splitting the route/page graph.

## 2026-06-30 Public Web Build Recovery, Route Code Split, And Portal Smoke

### Implemented and deployed

- Restored `smart-health-web` build/deploy files that were missing from the web root: `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.firebase.config.ts`, `index.html`, `firebase.json`, `.firebaserc`, `bunfig.toml`, and `eslint.config.js`.
- Converted `src/app/routes.tsx` from eager page imports to React Router lazy layout/page imports. The lazy route groups include direct `hydrateFallbackElement`, so Chrome no longer logs the React Router HydrateFallback warning.
- Firebase build now splits the public/auth/portal pages into route chunks. Production Firebase output includes `index-BQJHr-Te.css`, `index-e8iN3TOO.js` (~59 kB), `firebase-auth-nVj09n61.js` (~105 kB), `motion-Cim-g1up.js` (~127 kB), and `react-core-m1p_GdN4.js` (~283 kB); no JS chunk exceeds 500 kB.
- Added `/api/portal/status` coverage to `scripts/workspaceAccessSmokeTest.js`: workspace admin receives scoped counts/status for `org_alpha`; platform admin is correctly rejected from the portal surface.
- Restored Firebase Hosting target mapping `.firebaserc` for `webapp -> shcare` and deployed `https://shcare.web.app`: version `projects/162993928259/sites/shcare/versions/b4872b04beaabdec`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782803246138000`.

### Verification

- Web: `bunx eslint src/app/routes.tsx`, `bunx tsc --noEmit --pretty false`, `bun run build`, and production-env `bun run build:firebase` passed.
- Backend: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, `npm.cmd run check:production`, and expected-failing `npm.cmd run check:production:strict` were run. Strict mode still exits nonzero because production provider envs are not loaded.
- Local Chrome preview: mobile 390px had `scrollWidth=clientWidth`, proof cards were full width, route navigation reset scroll to `0`, desktop reveal moved from pending offset/blur to visible, and console had no warnings/errors.
- Live smoke: `https://shcare.web.app/`, `/login`, and Render `/api/health` returned HTTP 200. Live HTML serves `Cache-Control: no-cache, no-store, must-revalidate` and assets `index-BQJHr-Te.css`, `index-e8iN3TOO.js`.
- Live Chrome: mobile 390px no overflow, proof card width about 385px, route scroll reset from `1600 -> 0`, desktop reveal visible count was nonzero after scroll, and console had no warnings/errors.

### Remaining Limits

- Full authenticated portal E2E still requires real doctor/clinic/workspace accounts and production-like data.

## 2026-07-01 Public Web Contrast, Registration Choice, And Hero Theme Fix

### Implemented and deployed

- Fixed the user-reported light/dark contrast regressions in the public web layer. CTA headings/buttons stay high-contrast on dark teal backgrounds, and the handoff/workflow panel uses dark surfaces with readable text in dark mode instead of pale gray cards with white text.
- Fixed doctor registration step 2 in `RegisterDoctorPage.tsx`: `Bác sĩ Tư nhân` and `Cơ sở Y Tế / BV` are now real radio inputs inside the card labels, and clicking the whole card updates `form.type`.
- Fixed login icon visibility in `LoginPage.tsx` by adding scoped auth icon classes and final CSS rules for light/dark input states.
- Fixed home hero theme behavior in `PublicLayout.tsx`: the top video hero is dark by default even while global theme is light, and `data-shc-home-hero` switches from `active` to `rest` after scrolling so the page returns to light theme smoothly.
- Preserved route scroll reset behavior; navigation from a scrolled public route now returns the next route to `scrollY=0`.
- Follow-up visual-fit hardening keeps the home hero H1 and preview mockup inside low desktop viewports, strengthens auth icon strokes, and makes the registration radio indicator follow `input:checked` directly.
- Deployed Firebase Hosting site `shcare`: version `projects/162993928259/sites/shcare/versions/c200f17fb8931766`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782855884181000`.

### Verification

- Web: `bunx tsc --noEmit --pretty false` passed.
- Web Firebase: `bun run build:firebase` passed and produced `dist-firebase/assets/index-aaZfmmcI.css`, `PublicLayout-B2CYFvFo.js`, `LoginPage-DAkTI_4E.js`, `RegisterDoctorPage-DN3Cnnq3.js`, and `HomePage-DIYiFik_.js`.
- Local Chrome preview: verified 1920x768 and 1536x768 home hero fit, top-of-home light mode still renders dark hero video (`data-shc-home-hero=active`), scroll changes it to `rest`, CTA and handoff dark-mode contrast are readable, login icons are visible, step-2 registration cards select correctly, mobile 393px has no horizontal overflow, route reset returns to `scrollY=0`, and console is clean.
- Latest live Chrome: `https://shcare.web.app/?qa=20260701-live-final` served CSS `index-aaZfmmcI.css`; 1920x768 home H1/preview stayed inside the viewport; `/san-pham` route navigation reset from `scrollY=1800` to `0`; `/login` inputs/icons rendered visibly; `/register` step-2 private and clinic options selected with `checked=true`; 393px mobile had no horizontal overflow; console had no messages.

### Remaining Limits

- This fixes public/auth UI defects only. Full authenticated portal E2E still requires approved real doctor/clinic/workspace accounts and production-like data.
- Production readiness strict remains blocked by real provider secrets and infrastructure envs: Firebase Admin, public backend URL, Postgres, object storage, PHI encryption, Brevo/SMS/Zalo/MQTT, and firmware signing/OTA hardening.

## 2026-07-01 Backend Production Audit After Shcare UI Release

### Verification

- Backend syntax check passed: `npm.cmd run check`.
- Local/runtime smoke passed: `npm.cmd test`, `npm.cmd run smoke:workspace-access`, and `npm.cmd run smoke:repositories`.
- Public deployment smoke passed on rerun: `npm.cmd run smoke:public-deployment` confirmed Render backend health, unauthenticated `/api/me` 401, `shcare-admin.web.app` SPA rewrites, and `shcare.web.app` `/login` plus `/portal/patients` SPA rewrites.
- Production readiness report still returns `BLOCKED`; strict mode exits nonzero as expected because local env is still demo/json/local and lacks real provider configuration.

### Remaining Limits

- To make BE truly non-demo production, provide and load production envs: `AUTH_MODE=production`, Firebase Admin config, public HTTPS backend URL, Postgres `DATA_BACKEND=postgres`/`DATABASE_URL`, S3/R2 object storage, `PHI_ENCRYPTION_KEY`, provider keys for Brevo/SMS/Zalo if needed, Redis/MQTT if multi-instance/queue/control-plane separation is required, and firmware signing/rollback hardening.

## 2026-07-01 Hero Seam Fix, Live E2E, And Strict Env Status

### Implemented and deployed

- Smoothed the home hero transition from forced dark first viewport to light-mode content by driving a CSS progress variable from `PublicLayout.tsx` and extending the final CSS bridge between `.shc-hero` and `.shc-section-proof`.
- Adjusted the scroll threshold so the hero exits earlier on desktop; the page no longer waits until the next white section is already visible before changing state.
- Deployed `https://shcare.web.app` via Firebase Hosting target `webapp -> shcare`: version `projects/162993928259/sites/shcare/versions/ea356aa73da03f62`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782903091097000`.
- Refreshed the doctor canary Firebase password/claims for the existing canary UID only, then ran authenticated live E2E without printing any password, API key, or token.

### Verification

- Web: `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, and `bun run build` passed.
- Live Chrome: `https://shcare.web.app/?qa=hero-live-final-20260701` showed no horizontal overflow; top state stayed dark/active; desktop seam entered rest/light state before the white body dominated; console had no warnings/errors.
- Backend public smoke: `npm.cmd run smoke:public-deployment` passed on rerun after one transient abort.
- Authenticated E2E: Firebase sign-in + `/api/auth/firebase` + `/api/me` + read-only portal status/overview/patients/devices/scans/notifications/reports/audit-log passed for `workspace_facility_smoke` and `doctor_portal_canary`.
- Production strict: `npm.cmd run check:production:strict` still exits nonzero with `BLOCKED` in the local shell because Render/Supabase/Firebase secret envs are not loaded into local PowerShell. This is not evidence that Render/Firebase/Supabase must be created again.

### Remaining Limits

- Render backend, Firebase Auth/Hosting, Supabase Postgres, and Supabase Storage S3-compatible setup were already completed in earlier slices. Do not tell the user to recreate those services; instead verify the existing Render env/deploy state or ask for Render dashboard/API access only if host env inspection is required.
- Remaining source/deploy risk: deploy the latest backend source fix to Render, then run live authenticated mutation smoke against the existing Firebase/Supabase-backed backend.
- Optional or still-provider-dependent items remain Brevo/email, SMS/Zalo webhook, Redis, MQTT, and firmware signing key unless the user confirms those were also configured.

## 2026-07-01 Backend Contract Fix For Web Admin/Portal

### Implemented locally

- Fixed a backend route drift between Web Admin and `web-monitor`: `smartHealthApi.listDeviceEvents(id)` calls `/devices/:id/events`, but the event handler was missing from `handleDevicesApi`.
- Moved device event history into the device route with `assertCanAccessDevice`, so read-only device viewers can read in-scope events while mutations still require device-management capability.
- Removed a misplaced notification `events` block and `assertCanManageDevice(user, device)` call from `handleNotificationsApi`; this was unrelated to notifications and could crash single-notification delete because `device` was undefined.
- Extended `scripts/workspaceAccessSmokeTest.js` to cover in-scope device event reads, cross-workspace denial, viewer denial without device capability, and `/api/portal/notifications/:id` delete.
- Expanded `scripts/workspaceAccessSmokeTest.js` again as the Shcare Portal backend-contract smoke. It now covers public contact, portal status/overview/monitoring/reports/audit, patient CRUD, patient share/revoke, scan update, device assign/command, staff create/list, settings/workspace patch, `/api/v1/me` notification preferences, share-target tenant scoping, notification read/read-all/delete, and cross-workspace denials.

### Verification

- Backend syntax check passed: `npm.cmd run check`.
- Local/runtime smoke passed: `npm.cmd test`.
- Workspace access and portal backend-contract smoke passed: `npm.cmd run smoke:workspace-access`.
- Repository smoke passed: `npm.cmd run smoke:repositories`.
- Deployed backend source through commit `409a3592` (`Fix portal backend route contract`) pushed to `origin/main` for Render auto-deploy.
- Deployed production tooling through commit `71a38f3e` (`Add backend production smoke tooling`): `npm start` now runs migrations first when `DATABASE_URL` exists, migration `006_secure_public_tables.sql` enables deny-by-default RLS/revokes Supabase direct client table roles, portal rewrite checks were added to `smoke:public-deployment`, and `smoke:repositories` is tracked.
- Fixed the live portal auth/register connection error by redeploying `shcare.web.app` with production frontend envs instead of the localhost API fallback. Firebase Hosting `shcare` version `e59c69dd22c36505` is live; its main bundle contains `https://smart-health-api-xj0a.onrender.com/api` and no `localhost:3000` API base.
- Public deployment smoke passed on rerun after one transient abort; this confirms live Render/Firebase Hosting health.
- Production role smoke passed against Render/Firebase Auth: `npm.cmd run smoke:production-roles` verified platform admin and workspace admin `/api/me` role/capability separation.
- Live route-contract canary passed: `doctor.viewer.smoke@smarthealth.test` returned backend `role=doctor`, had `workspace.devices.view`, did not have `workspace.devices.manage`, and received HTTP 200 from `GET /api/v1/devices/lite-steth-a92/events` on `https://smart-health-api-xj0a.onrender.com`.
- Production readiness report still returns `BLOCKED` in the local shell because local env is demo/json/local and lacks Render-hosted production secrets. Do not treat this as a request to recreate already-configured Render/Firebase/Supabase services.

### Remaining Limits

- Strict local production check remains blocked until real provider envs are loaded into the process running the check. Existing project docs say Render/Firebase/Supabase/Postgres/S3-compatible storage were configured previously; do not restart provider setup from scratch.
- Remaining BE production hardening is provider/runtime completeness: verify the actual Render env values through Render access, restrict CORS if still broad, finish Brevo/SMS/Zalo/Redis/MQTT decisions as needed, and add deeper browser/API mutation smoke for storage/audio/scan flows.
