# Smart Health - New Chat Context

Last updated: 2026-07-02

This is the first file a new Codex chat should read before working on Smart Health. Its purpose is to reduce quota/token usage by summarizing the project state, decisions, paths, tools, and next work so the assistant does not re-scan the entire codebase from scratch.

## Mandatory Context Maintenance Rule

After every meaningful code or configuration change in the Smart Health project, update these project context files before finishing the turn:

- `D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md` when commands, ports, env vars, verification steps, or runbooks change

Update only the sections affected by the change. Keep the files concise, factual, and current. The goal is to make future new chats cheap: read the context docs first, then inspect only the few relevant source files.

## 2026-06-24 — Shcare Workspace Portal is live

- `D:\Study\KLTN\smart-health-web` is the deployed doctor/clinic Workspace Portal at `https://shcare.web.app`; it is distinct from the platform-admin site `https://shcare-admin.web.app`.
- Public, contact, and auth surfaces were redesigned around the clinical workspace product direction. Light/dark modes and the mobile public/auth routes were checked for overflow, broken images, placeholder links, accessible labels, form names, and password autocomplete.
- Follow-up visual direction on 2026-06-24: do not revert the portal to a rigid old clinical-minimal look. The current local design layer is `smart-health-web\src\web-styles\signal-horizon.css`, imported after `clinical-system.css`. It intentionally mixes the local references under `smart-health-web\MẪU UI UX` including `DESIGN (4).md` plus live visual reads of Origin, Mercury, dope.security, and General Intelligence Company: cinematic/painted atmosphere, floating pill nav, frosted glass cards, violet-blue-cyan gradients, product preview depth, and tasteful motion. Keep data truthful and states readable, but expressive glass/gradient/motion is now part of the desired style.
- Firebase Hosting target `webapp -> shcare` is live on version `0cace76db422ed7c`, release `1782257445764000`. SPA HTML routes use `no-cache, no-store, must-revalidate`; fingerprinted assets stay immutable. The Signal Horizon production smoke loaded `https://shcare.web.app/` with CSS asset `index-DACGA5fI.css`; Render health was HTTP 200 at `https://smart-health-api-xj0a.onrender.com/api/health` during the release check.
- Do not describe the portal as fully production-validated yet: authenticated doctor/clinic E2E, production Supabase/Postgres RLS parity, and all portal mutation flows still need verification with approved real accounts.

## 2026-07-01 — Shcare UI contrast, registration, and hero behavior fix

- `smart-health-web` was patched for the user-reported public/auth UI defects: light/dark contrast on CTA and handoff/workflow surfaces, login email/password icons, doctor-registration step 2 choice cards, and route scroll reset behavior.
- `RegisterDoctorPage.tsx` now renders real radio inputs for the step-2 `Bác sĩ Tư nhân` and `Cơ sở Y Tế / BV` choices and updates `form.type` from the whole card click target.
- `LoginPage.tsx` now marks auth icons with scoped classes so `signal-horizon.css` can keep them visible in both light and dark modes.
- `PublicLayout.tsx` now tracks `data-shc-home-hero=active/rest`: at the top of `/`, the video hero stays dark even in global light mode; after scrolling out of the hero, the light theme returns smoothly.
- Follow-up visual-fit hardening on the same day tightened the desktop-low hero layout so the headline/mockup no longer feels cropped, made the registration radio indicator track `input:checked`, and strengthened auth icon strokes/contrast.
- Latest live deploy completed to Firebase Hosting site `shcare`: version `projects/162993928259/sites/shcare/versions/c200f17fb8931766`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782855884181000`. Live CSS asset observed: `https://shcare.web.app/assets/index-aaZfmmcI.css`.
- Local and live Chrome QA confirmed: 1920x768 and 1536x768 home hero fit without headline/preview crop, home hero top dark/light-scroll transition, CTA/handoff dark-mode contrast, login icon visibility, doctor-registration step-2 selection for both options, 393px mobile no horizontal overflow, route navigation scroll reset to `0`, and clean console.

## 2026-07-01 — Firebase doctor role/surface sync fix

- User-reported login mismatch was traced end-to-end: `baobee100624@gmail.com` had Firebase custom claims `role=doctor` and `organizationId=vn_hospital_quan_y_175`, but Render backend still returned `role=patient`, `allowedSurfaces=["android"]`, `defaultSurface=android`. The portal login collapsed every non-portal account into the misleading admin message, while web admin correctly rejected the same email as non-platform-admin.
- Backend commit `be70b551` now syncs trusted Firebase custom claim `doctor` into backend `role=doctor`, `requestedRole=doctor`, `roleRequestStatus=approved`, materializes catalog workspaces such as `Bệnh viện Quân y 175`, and persists that workspace in repository mode. `productionRoleSmokeTest.js` now includes a real Firebase doctor portal smoke account so future claims/DB surface drift is caught.
- `smart-health-web` login now differentiates wrong surface reasons: platform admin, Android-only/patient, pending, needs-info, rejected, and generic portal denied. Existing Firebase browser sessions that are not allowed on the portal are signed out instead of leaving a stale backend token.
- Deployed `shcare.web.app` Firebase Hosting version `projects/162993928259/sites/shcare/versions/b7b7cbd5b2aa7ea4`, release `projects/162993928259/sites/shcare/channels/live/releases/1782922148098000`; live portal bundle has Render API URL and no localhost API fallback.
- Rebuilt/deployed `shcare-admin.web.app` Firebase Hosting version `projects/162993928259/sites/shcare-admin/versions/3dd196503be75e50`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1782922169045000`; live admin bundle contains the portal redirection message for doctor/workspace accounts and no longer contains the old `Tài khoản chưa có quyền quản trị` login guard text.
- Verified live after Render deploy: `baobee100624@gmail.com` returns `role=doctor`, `roleRequestStatus=approved`, `allowedSurfaces=["portal","android"]`, `defaultSurface=portal`, workspace `Bệnh viện Quân y 175`; `npm.cmd run smoke:production-roles` passes for platform admin, workspace admin, and doctor portal; `npm.cmd run smoke:public-deployment` passes for Render, `shcare-admin`, and `shcare`.

## 2026-07-02 - MSM261 firmware-only correction and validation

- Ran the current cross-surface smoke matrix from the handoff: backend `check`, `test`, `smoke:workspace-access`, `smoke:repositories`, `smoke:public-deployment`, `smoke:production-roles`, and local `smoke:api-production` passed. The first public smoke attempt aborted on live network fetch, but the isolated rerun passed.
- Rebuilt `smart-health-web` with production Firebase/Render envs; `bunx tsc --noEmit --pretty false` and `bun run build:firebase` passed. Live `shcare.web.app` still serves main JS `assets/index-CrirQFf4.js` with `smart-health-api-xj0a.onrender.com/api` present and `localhost:3000` count 0.
- Rebuilt Web Admin with `npm.cmd run build:firebase:admin`; live `shcare-admin.web.app` has no `Tài khoản chưa có quyền quản trị` guard text in fetched JS assets and still contains portal-domain routing copy.
- Android `.\gradlew.bat :app:compileDebugKotlin` passed. Android debug default remains the public Render backend; release builds still block non-HTTPS/local backend URLs.
- User confirmed INMP441 is no longer part of the product target. Firmware work, docs, commands, and validation now treat `D:\Study\KLTN\smart-health-embedded\MSM261S4030H0` as the only production firmware folder.
- MSM261 firmware builds passed with `C:\Users\baobe\.platformio\penv\Scripts\platformio.exe` for default, normal `esp32-s3-devkitm-1`, and OTA `esp32-s3-ota` environments. WiFi and device secrets remain build/provisioning flags, not source constants.
- Regenerated `smart-health-embedded\MSM261S4030H0\compile_commands.json`; it no longer points IDE tooling at the retired INMP441 folder.
- Local `npm.cmd run check:production:strict` still reports `BLOCKED` because local PowerShell does not contain Render/Supabase/S3/PHI/email provider envs. This is a local-env limitation, not evidence that Firebase/Render/Supabase must be recreated. No Render CLI/API key/config was present in the workspace to inspect host secrets directly.

## 2026-07-02 - Web registration email verification hardening

- Root cause after the user reported no verification email: `smart-health-web` created the Firebase account and treated Firebase client-side verification-mail request acceptance as delivery. The backend also accepted doctor/workspace requests without an observable email delivery path, and `AuthProvider` could sign out pending/non-portal Firebase sessions, making resend/check flows fragile.
- Backend now has `POST /api/auth/email-verification`. It requires a Firebase bearer token, reloads the Firebase user, returns `verified` if Firebase already marks the email verified, otherwise generates a Firebase email-verification link with Firebase Admin and sends a branded email through the existing outbound `sendEmail()` stack. The endpoint never returns the OOB verification link to the browser.
- `WEB_PORTAL_URL`/`SHCARE_WEB_URL`/`SMART_HEALTH_WEB_URL`/`PUBLIC_SITE_URL` can pin the continue URL; default remains `https://shcare.web.app/xac-nhan-email`. Optional `FIREBASE_AUTH_LINK_DOMAIN`/`FIREBASE_LINK_DOMAIN` can set the Firebase Hosting link domain.
- `smart-health-web` registration and email verification pages now call the backend delivery endpoint. If Brevo/SMTP is missing, the completion screen says the profile/workspace request was saved but verification email could not be sent, instead of claiming the email was sent. Login now routes pending/needs-info/rejected accounts to the correct onboarding pages, and `AuthProvider` keeps those onboarding sessions instead of signing them out.
- Added backend script `npm.cmd run smoke:firebase-email`, which creates a temporary Firebase user, generates a verification action link for `https://shcare.web.app/xac-nhan-email`, asserts the link shape, and deletes the temp user without sending email or printing the OOB link.
- Verified locally: backend `check`, `test`, `smoke:workspace-access`, `smoke:repositories`, `smoke:api-production`, `smoke:production-roles`, `smoke:public-deployment` rerun, `smoke:firebase-email`, runtime endpoint smoke for missing Brevo config, Shcare Web `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, targeted ESLint, Web Admin Firebase build, Android `:app:compileDebugKotlin`, and MSM261 PlatformIO default/OTA build passed.
- Deployed backend commit `7ca15841` through GitHub/Render and confirmed live `POST https://smart-health-api-xj0a.onrender.com/api/auth/email-verification` now returns 401 instead of 404 without a bearer token.
- Deployed Shcare Web Firebase Hosting target `webapp` to `https://shcare.web.app`, version `aac78c3631f574b4`. Live bundle `index-CodKkm8k.js` contains the Render API base, contains `/auth/email-verification`, and does not contain `localhost:3000`.
- Production canary with a temporary unverified Firebase doctor user called live `/api/auth/firebase` then `/api/auth/email-verification`; Render returned `status=sent`, `provider=brevo`, and the temporary backend user was deleted. CORS preflight from `https://shcare.web.app` to the endpoint returned 204 with the correct origin.
- Local strict production gate still reports `BLOCKED`; the email-specific local warning is expected because `BREVO_API_KEY` and `BREVO_FROM_EMAIL` are not in local PowerShell. Render is configured enough for the new endpoint to return `provider=brevo` in production.

## 2026-07-02 - Shcare Web source tracked in Git

- `smart-health-web` is no longer left as an untracked local project. Source/config/design references needed to rebuild the deployed portal were staged for Git, including `bun.lock`, Firebase Hosting config, `docs/Logo.png`, and the runtime `MẪU UI UX/bacsi.mp4` asset imported by `HomePage.tsx`.
- Root `.gitignore` now excludes generated/local web artifacts: `smart-health-web/dist/`, `dist-firebase/`, `.firebase/`, `.vite/`, `.tanstack/`, `.lovable/`, and `firebase-debug.log`, while explicitly allowing the required `bacsi.mp4`.
- Added `.github/workflows/deploy-shcare-web.yml` so GitHub can build `shcare.web.app` from tracked source on push. Firebase Hosting deploy is manual-only through `workflow_dispatch` and requires GitHub Secrets for Firebase config and service account JSON.
- Fixed `smart-health-web/eslint.config.js` so `scripts/**/*.mjs` lint under Node globals. Verified from `D:\Study\KLTN\smart-health-web`: `bun install --frozen-lockfile`, `bun run lint`, `bunx tsc --noEmit --pretty false`, and production `bun run build:firebase` passed.

Final responses after Smart Health implementation work must include a short "Còn chưa làm / tiếp tục" section listing the remaining planned work and the next practical step. This is required so future chats and the user do not have to ask what remains after each execution.

## New Chat Starter Prompt

Use this in a new chat:

```text
Hãy đọc trước:
D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md
D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md
D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md
D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md

Sau đó dùng skill global đã cài:
C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md

Nếu claude-mem chưa chạy, hãy tự bật bằng `npx claude-mem start` ở background. Tiếp tục làm dự án Smart Health theo context đó. Sau mỗi lần chỉnh sửa hoặc bổ sung code/config, hãy cập nhật lại các file context dự án để lần new chat sau không phải đọc lại toàn bộ codebase và đỡ tốn quota/token.
```

## Companion Files

- `SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`: canonical product direction for remote-first monitoring, family/dependent profiles, package quota semantics, and clinic/hospital Workspace Portal.
- `SMART_HEALTH_KLTN_REPORT_COMPLETION_PLAN.md`: report-first checklist derived from `PL2 (3)-IEEE references.docx`; use it to finish KLTN evidence/content before opening the next production-development slice.
- `SMART_HEALTH_THIRD_PARTY_SETUP.md`: production setup guide for Firebase, HTTPS backend host, Postgres, S3/R2 storage, Redis, Brevo email API/SMTP fallback, SMS/Zalo webhook, Android release, and ESP provisioning secrets.
- `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md`: Vietnamese step-by-step setup/runbook for the current deployed stack: GitHub Actions, Render env, Supabase Postgres/S3, Firebase Hosting, admin account creation, Android, ESP first flash, and cloud OTA smoke.
- `SMART_HEALTH_AGENT_SKILLS_GUIDE.md`: Vietnamese guide for selecting Codex skills/handoff rules without loading every skill and wasting context.
- `SMART_HEALTH_IMPLEMENTATION_STATUS.md`: what is already implemented, what is partial, and what remains demo/scaffold.
- `SMART_HEALTH_PRODUCTION_BACKLOG.md`: ordered production backlog and recommended next milestones.
- `SMART_HEALTH_COMMANDS_GUIDE.md`: local run, build, smoke, Firebase, MCP, and tooling commands.
- `C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`: project-specific Smart Health rules consolidated into the global Codex skills folder.
- `C:\Users\baobe\.agents\skills`: canonical user-wide directory for third-party skills shared by every Smart Health repo; there are no project-local skill copies under `D:\Study\KLTN`.

## Workspace Map

- Root: `D:\Study\KLTN`
- Embedded/backend root: `D:\Study\KLTN\smart-health-embedded`
- Backend monitor/server: `D:\Study\KLTN\smart-health-embedded\web-monitor`
- Firmware MSM261 ESP32-S3: `D:\Study\KLTN\smart-health-embedded\MSM261S4030H0`
- Android app: `D:\Study\KLTN\smart-health-android`
- Android Figma reference: `D:\Study\KLTN\smart-health-android\figma`
- Web admin: `D:\Study\KLTN\smart-health-admin\thiết kế giao diện`
- Earlier/admin design reference: `D:\Study\KLTN\smart-health-admin\connect-hub-main`
- Firebase service account folder: `D:\Study\KLTN\firebase`
- Project docs and handoff files: `D:\Study\KLTN\docs`

## Current Product Direction

- Smart Health is now positioned as a remote-first, multi-audience workspace platform: hospital/clinic, solo practice, and personal/family health.
- Canonical product direction is in `D:\Study\KLTN\docs\SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`; read it before changing workspace/package/device/family-profile/portal behavior.
- Smart Health should not be positioned as an in-room replacement for a traditional stethoscope. Its core value is connected device deployment, realtime remote monitoring, stored clinical audio, AI support, sharing, and workspace administration.
- The billing unit is `workspace`, not an individual user. Existing `organizationId` remains compatible but should be interpreted as `workspaceId` in new code.
- Device quota means activated/deployed devices in a workspace, not number of patients. One activated device can measure many patient profiles.
- Personal/family users should be able to create multiple patient profiles for relatives/dependents under one account; separate accounts for every family member are optional, not required.
- Official web surface split: `shcare-admin.web.app` is only for Platform Admin/system administration; `shcare.web.app` is the user portal for doctors, solo doctors, clinics/facilities. Android remains for patients/personal users and doctors, not clinic administration.
- Backend `/api/me` should expose workspace context (`memberships`, `currentWorkspaceId`, `currentMembership`, `workspace`, `currentWorkspace`) plus backend-derived `capabilities`, `allowedSurfaces`, and `defaultSurface`; web builds use those fields to block the wrong domain and route users to the correct surface.
- Patient/profile APIs, device/scan mutation APIs, storage/object download, notification listing, export listing/download, and access-log listing are the first backend routes being tightened for Workspace Portal isolation: platform admin can see global records, workspace roles are scoped to `currentWorkspaceId`, personal/patient users stay limited to their own profiles/workspace, and solo-practice owners get device-management capability for their own workspace. Cross-workspace/forbidden `403` responses now append `access.denied` audit metadata plus warning access logs in backend JSON/demo mode. Continue this same scoping pattern for remaining admin-only storage actions, signed URL edge cases, repository-backed audit parity, and deeper frontend action coverage inside every dialog/form field.
- Backend JSON mode keeps `organizations` as the workspace source of truth with `workspaceType`, `packageId`, `subscriptionStatus`, `billingCycle`, owner, usage, and quota fields.
- Android remains one shared app. Signup currently branches into personal user, solo doctor, and doctor belonging to a health facility. Full workspace switcher/dashboard specialization is still backlog.
- Web admin Packages page is backed by real `/api/admin/packages` data. Workspace/customer management still uses the Clinics route/component name in some files for compatibility.
- 2026-05-26 update: backend `/api/admin/*` no longer assumes only `role=admin`; it uses `requireUser` plus capability checks for Workspace Portal access. Storage upload/share/delete/download, exports/download, packages, workspace CRUD/package assignment, doctor/staff actions, settings/AI updates, data delete, patients/family profiles, scan access, and sharing have stronger backend-side enforcement in JSON/demo mode.
- 2026-05-26 update: a real HTTP smoke script `npm run smoke:workspace-access` logs in six accounts (`admin`, `workspace_admin`, `doctor`, `technician`, `billing`, `viewer`) against a seeded temporary backend and verifies role/cross-workspace behavior, including technician device pairing but no package/storage share permission.
- 2026-05-26 update: Android now has a first family-profile slice: list/create dependent patient profiles, select a profile before starting a scan, and share a profile/scan to a doctor/workspace through `/api/patients/:id/shares`.
- 2026-06-05 update: KLTN report-first evidence was captured in `D:\Study\KLTN\docs\report-evidence\2026-06-05`: firmware PlatformIO build passed, backend `npm run check` passed, backend workspace smoke passed, backend runtime smoke passed (`/api/health`, WebSocket `/app`, UDP test packet), Android `:app:compileDebugKotlin` passed, and web admin `npm run build` passed with only Vite bundle-size warnings. A report-ready Word copy was generated at `D:\Study\KLTN\docs\PL2 (3)-IEEE references.report-ready-20260605.docx` with Chapter 4 technical verification results and Appendix D evidence mapping.
- 2026-06-05 update: KLTN evidence was expanded into `D:\Study\KLTN\docs\PL2 (3)-IEEE references.final-evidence-20260605.docx`. Added web admin screenshots for the main modules, Android emulator screenshots after `:app:assembleDebug` install/launch, audio WAV metadata/waveform evidence, and a final evidence summary. During browser capture, `Overview.tsx` was fixed by adding the missing `Users` import from `lucide-react`; web admin build passed again afterward. Physical ESP32-S3 serial/upload evidence remains pending because `platformio device list` only detected COM3/COM4 Bluetooth links, not COM6/ESP32-S3.
- 2026-06-11/22 tooling update: Matt Pocock skills were first installed project-locally, then migrated to the user-wide `C:\Users\baobe\.agents\skills` directory on 2026-06-22. The project-local `.agents` tree and `skills-lock.json` were removed. Do not read every installed skill by default; open only the selected skill for the current task.
- 2026-06-11 update: Android doctor signup catalog dropdowns were hardened. If backend catalog loading fails or returns empty, `Cơ sở y tế` and `Chuyên khoa` no longer become dead buttons; they open a dialog with the backend error/empty state and a `Tải lại danh mục` action.
- 2026-06-12 update: doctor approval/resubmit flow now preserves refreshed profile fields instead of showing stale values. Backend role-request persistence carries updated name, phone, license, clinic/private-clinic name, specialty, registration reason, `workspaceType`, `accountType`, and `clinicSuggestion`; admin email metadata labels those fields in Vietnamese. Android signup distinguishes `Bác sĩ tư` from `Bác sĩ cơ sở`: solo doctors choose or enter a private clinic name, and the needs-info resubmit form asks for `Tên phòng khám tư` instead of forcing a hospital/facility picker. Web Admin Doctor Approval now displays `Bác sĩ tư/Bác sĩ cơ sở` and `Phòng khám/cơ sở` in the table/detail.
- 2026-06-12 update: Android needs-info resubmit now derives doctor type from the original backend registration metadata instead of asking the doctor to choose again. Private doctors see only the private-clinic fields such as `Tên phòng khám tư`; facility doctors see the health-facility picker. The polling loop stops while status is `needs_info` so the form no longer overwrites in-progress edits.
- 2026-06-12 update: Android Firebase email verification reliability was hardened. `SplashScreen` now reloads the Firebase user before routing unverified accounts, `FirebaseVerifyEmailScreen` separates Firebase reload, token refresh, backend auth, and role-request errors instead of showing one generic verification error, and resend-email reloads the user first so already verified accounts get a clear "continue" message instead of silently not sending a new email.
- 2026-06-12 update: Android auth/verification back-button spacing was normalized. Shared `VerificationBackButton` now applies status-bar-safe top spacing, so `verify-email`, phone-login fallback, and contact verification screens align lower like the signup/forgot-password back controls instead of sitting too close to the top edge.
- 2026-06-12 update: Android doctor-login recovery now preserves an existing full pending registration when a user logs in before email verification, instead of overwriting it with blank name/phone data. If a verified doctor login reaches backend auth but no doctor request exists yet, `LoginScreen` resubmits the stored doctor request and routes to pending approval; rejected doctor requests keep a distinct rejection message.
- 2026-06-12 update: doctor-login recovery follow-up fixed the backend solo-practice persistence gap. `/api/auth/role-request` now upserts the selected workspace/private clinic before saving the doctor user, avoiding Postgres `organization_id` failures for new `solo_doctor` requests. Android also parses standard `{ error: { message } }` API errors and re-checks backend auth after a role-request exception so it can still route to pending approval if the request was persisted before an error response.
- 2026-06-12 deployment note: commit `8a2c9a4` was pushed to `origin/main`, Render served the backend fix, public deployment smoke passed, and a production canary created a temporary `solo_doctor` request with `workspaceType=solo_practice`, confirmed it appeared in the pending admin list, then deleted the canary account.
- 2026-06-12 update: Web Admin doctor account lock is now a real account lock. Backend `PATCH /api/admin/doctors/:id/lock` keeps the approved doctor record visible with `accountStatus=locked`, disables the linked Firebase Auth account when available, revokes Firebase refresh tokens, revokes backend sessions, and auth/login guards reject locked accounts. Unlock re-enables Firebase and restores doctor custom claims. `npm.cmd test` covers approve -> lock -> blocked old session/login -> unlock -> login again.
- 2026-06-12 deployment note: commit `320f519` was pushed to `origin/main`, Firebase Hosting Web Admin version `0cd9234ba6609f76` was released to `https://shcare-admin.web.app`, public deployment smoke passed, and a production canary created a temporary approved doctor, locked it, confirmed Firebase Auth `disabled=true` plus old doctor token HTTP 401, unlocked it, confirmed doctor login active again, then deleted the canary doctor/Firebase user.
- 2026-06-12 update: web surfaces are now split in the existing web codebase. `shcare-admin` builds in admin mode with platform-only navigation/guard; `shcare` builds in portal mode with doctor/clinic workspace navigation and wrong-surface CTA. Backend adds `/api/portal/*` semantic routes while keeping legacy routes compatible. Firebase Hosting now has separate `admin` and `webapp` targets/public folders, and public smoke checks both sites. Figma prompts are split: `Figma_Admin_Web_Prompt.md` is platform-admin-only and `Figma_Shcare_Web_Portal_Prompt.md` is the user-facing portal design prompt.
- 2026-06-06 update: cloud-first device control slice was implemented. The Web Admin Devices page now treats backend cloud as the management source, shows heartbeat-derived online/offline state, WiFi/IP/RSSI, firmware/audio/OTA status, device event history, and sends restart/revoke/rotate/OTA commands through backend APIs. Backend added WSS device socket registration, device telemetry/event persistence, `POST /api/v1/devices/:id/commands`, `GET /api/v1/devices/:id/events`, and cloud OTA command creation on `POST /api/v1/devices/:id/ota`. Firmware `MSM261S4030H0` now opens an outbound WebSocket to the backend, sends heartbeat/audio frames/events, receives cloud commands, performs HTTPS firmware download with SHA-256 verification, and falls back to the local AP `SmartHealth-xxxxxx` at `http://192.168.4.1` only for WiFi SSID/password recovery. The old `smarthealth-xxxxxx.local/admin` path is not the product management path.
- 2026-06-06 update: storage-backed cloud OTA release selection is now wired. Backend storage uploads compute SHA-256 and infer firmware version for bucket `device-firmware`; `POST /api/v1/devices/:id/ota` accepts `firmwareFileId`, creates a short-lived tokenized firmware download URL for the ESP, and hides that token from normal device API responses. Web Admin Devices can select an uploaded `.bin` from `device-firmware`, prefill version/checksum, or fall back to a manual URL. Android now parses cloud device fields (`online`, WiFi RSSI/SSID/IP, firmware, OTA/audio status) and uses backend cloud status in device settings, stethoscope settings, patient dashboard, and live audio headers; `LiveAudioClient` also sends the current bearer token on the WebSocket request.
- 2026-06-06 update: production readiness checker was added. Backend now has `npm run check:production`, `npm run check:production:strict`, and platform-only `GET /api/v1/settings/production-readiness`. Web Admin Settings has a `Triển khai` tab that shows required/warning/manual deployment checks. `.env.example` now lists the production third-party envs for Firebase, public HTTPS backend URL, Postgres, S3/R2, PHI encryption, Brevo email API/SMTP fallback, SMS/Zalo webhook, MQTT, and rate limit. `SMART_HEALTH_THIRD_PARTY_SETUP.md` documents which accounts/secrets the user must create before strict production smoke can pass.
- 2026-06-09 update: Android app cleanup moved several rough/demo paths to real behavior. New Scan and Live Monitoring now require real backend device/profile selection instead of defaulting to `android-app`; Medical Records and Record Detail no longer render hardcoded demo records/waveforms; profile save, avatar upload/delete, Firebase password reset/change-password, FCM token registration, notification permission request, and notification preference save are wired to Firebase/backend. Phone/SMS login no longer contains OTP `123456` demo logic; it clearly routes users back to Firebase email login until a real SMS provider is configured.

## Installed Local AI Tooling

These tools are installed globally for future Codex chats. New chats should use them only when relevant.

- Canonical global registry: `C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md`.
  - It defines storage locations, the mandatory tool/skill use order, plugin/MCP inventory, UI routing, duplicate prevention, installation policy, audit commands, and Antigravity portability.
  - Repo `AGENTS.md`/`.ai-instructions.md` files are short project-specific pointers only; they must not copy the global catalog.
  - 2026-06-23 routing/token-gate update: every task should start by mapping the request to the smallest relevant installed skill/tool. Within that gate, use lightweight `context-budget` + `strategic-compact` routing to scope the task, pick the cheapest authoritative tool/source, and decide whether compact/handoff is useful. Load full ECC skill bodies only for non-trivial, broad, long-running, multi-repo, or tooling/audit work.

- Chrome DevTools MCP: configured as `chrome-devtools`.
  - Use for local web UI debugging, console/network inspection, screenshots, and performance checks.
- CodeGraph MCP: configured as `codegraph`.
  - Use for structural code questions: definitions, callers, callees, impact, traces.
  - Use `rg` for literal text search and CodeGraph for symbol/flow search.
- Codebase Memory MCP: `codebase-memory-mcp` v0.8.1 is configured as `codebase-memory`.
  - Use for broad architecture, semantic graph search, cross-repository links, change detection, and persistent ADRs; avoid repeating the same exploration through both graph servers.
  - `D:\Study\KLTN\smart-health-web` was indexed on 2026-06-22 as `D-Study-KLTN-smart-health-web` with 4,647 nodes and 19,239 edges; the index is in the local cache, not a tracked repo artifact.
- Context7 MCP and CLI/skill mode:
  - MCP server `context7` is configured.
  - CLI/skill `find-docs` is installed at `C:\Users\baobe\.agents\skills\find-docs`.
  - Use it when current library/API documentation is needed. Do not use it for business-logic debugging.
- gstack for Codex:
  - Installed at `C:\Users\baobe\.codex\skills\gstack-*`.
  - Useful skills include `gstack-review`, `gstack-cso`, `gstack-qa`, `gstack-investigate`, `gstack-ship`.
  - It is powerful but large; call only when it clearly helps.
- code-reviewer skill:
  - Installed at `C:\Users\baobe\.agents\skills\code-reviewer`.
  - Use for deliberate code review or risk review.
- Selective global skills installed on 2026-06-22:
  - `academic-research-suite`: Codex-native research-to-thesis router; prefer it for the KLTN literature review, drafting, citation checks, review, and revision pipeline.
  - Taste suite: 11 of 13 skills are installed user-wide. The base `gpt-taste` skill is always paired with `impeccable`; specialized skills cover brand kits, image-to-code, web/mobile image references, redesign, minimalist/brutalist/premium styles, Stitch, and full-output enforcement. `design-taste-frontend` and legacy v1 are skipped because they duplicate the Codex-specific base skill.
  - `context-budget` and `strategic-compact`: selected from `affaan-m/ECC` for context/token budgeting; the full ECC skill pack was not installed because it overlaps existing tools.
  - The assistant should infer and select the relevant installed skill/tool from the registry and `SMART_HEALTH_AGENT_SKILLS_GUIDE.md`; the user does not need to remember exact skill names.
  - 26 current, non-deprecated/non-duplicate skills from `mattpocock/skills`; all live user-wide under `C:\Users\baobe\.agents\skills`.
  - `impeccable` v3.8.0: always combined with `gpt-taste` for future web/admin/Android interface work. Impeccable owns UX/accessibility/production quality; Taste owns visual direction. Existing Smart Health tokens and product/native conventions override incompatible generic marketing rules.
- Agent Reach v1.5.0:
  - CLI and `agent-reach` skill are installed. Core web, YouTube, RSS, Exa search, V2EX, and basic Bilibili checks pass; GitHub CLI is installed but needs `gh auth login` for authenticated/private operations.
  - Optional Twitter/Reddit/Xiaohongshu/etc. channels require user login/cookies or provider credentials and are not enabled by default.
- claude-mem for Codex CLI:
  - Plugin is enabled in Codex config.
  - Worker/viewer runs locally at `http://localhost:37777`.
  - New Smart Health chats should make a best-effort check and start it automatically in the background if it is not running.

## Project Skill Location

The old project-local `D:\Study\KLTN\docs\.ai_skills` folder was consolidated into one global Codex skill:

`C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`

Use that skill for Smart Health-specific architecture, security, UI, firmware, and context-maintenance rules. Other general skills such as `frontend-design`, `code-reviewer`, `gstack-*`, `find-docs`, and Superpowers are already installed globally, so project-local duplicates are no longer needed.

2026-06-23 organization audit removed the remaining `.ai_skills` trees from both the active and older `Smart-Digital-Stethoscope` checkouts. Unique unverified hardware notes were archived at `C:\Users\baobe\.codex\project-rules\SMART_DIGITAL_STETHOSCOPE_LEGACY_NOTES.md`; global Superpowers/UI/security/review capabilities supersede the copied local files.

## Product Goal

Smart Health is an Edge AI Smart Digital Stethoscope system:

- ESP32-S3 firmware streams stethoscope audio and device telemetry.
- Android app is used by patients/doctors for registration, verification, live listening, scans, records, notifications, and role-specific dashboards.
- Web surfaces are split: `shcare-admin.web.app` manages platform/system administration; `shcare.web.app` manages doctor/clinic portal workflows such as patients, devices, audio/AI scans, monitoring, notifications, workspace audit, storage, and workspace settings.
- Backend currently runs as a Node.js service in `web-monitor`.

## Locked Architecture Decisions

- Firebase Auth stays as the user identity provider.
- Backend must verify Firebase ID tokens and must not trust role values sent by clients.
- User role, organization, and access rights must come from backend DB/custom claims.
- Control plane and audio plane are separate:
  - Control plane: MQTT or equivalent for commands, heartbeat, telemetry, device events, OTA metadata.
  - Audio plane: authenticated WSS for realtime listening and HTTPS chunk upload/object storage for durable scan files.
- Do not send long-running raw PCM/WAV audio through MQTT.
- Production object storage target: S3-compatible storage such as MinIO local and R2/S3 production, or Firebase Storage only if intentionally chosen later.
- Production DB target: PostgreSQL with normalized repositories. JSON state remains a demo fallback only.

## Current Runtime Shape

Cloud-first device flow now exists as the product direction:

- ESP32 connects outbound to backend over WebSocket/WSS, sends heartbeat telemetry, and streams audio frames to the backend. This works across different WiFi networks as long as the ESP and web/app can reach the backend through the Internet.
- Backend stores device `lastSeenAt`, online state, WiFi RSSI/SSID/IP, firmware version, audio status, OTA status, and event history. Web admin/app read status from backend, not from the device LAN IP.
- Web Admin sends device commands and OTA requests to backend. Backend delivers commands over the device WebSocket when connected and can also publish to the MQTT control plane when configured.
- Production OTA is cloud OTA: upload/host a `.bin`, send firmware version, HTTPS URL, and checksum through Web Admin, then the ESP downloads/verifies/installs/reboots itself.
- Local ESP portal is recovery only. When WiFi is missing or fails, the device opens AP `SmartHealth-xxxxxx`; the user enters only SSID/password at `http://192.168.4.1`. It must not expose OTA password, backend host, device secret, ownership, or admin settings.
- Production backend no longer auto-seeds demo users, organizations, devices, or notifications when `AUTH_MODE=production`. In production, scan creation/recording and device socket registration need an explicit device id; the demo device fallback is only kept for non-production mode.
- Realtime browser listeners at `/listen` and `/app` now accept `?token=` or `?access_token=`; production listens require a real auth token instead of opening the audio stream anonymously.
- `/api/me` now exposes `scopeType` and `scopeLabel` so the UI can clearly tell platform admin apart from workspace/hospital context without reusing the old clinic name in the platform footer.

Legacy demo/local flow remains available for development fallback:

- ESP32 MSM261S4030H0 sends PCM audio over UDP to backend port `3001`.
- Backend ingests UDP, keeps scan state, writes local WAV files, and fans audio/metrics out over WebSocket.
- Android listens to backend WebSocket `/app` for live audio and metrics.
- Web admin talks to backend REST APIs and Firebase Auth.

Important limitation: the local UDP demo path is useful for KLTN and iteration, but it is not production-secure yet. Cloud WSS/OTA now exists as the intended product path and storage-backed firmware selection is wired, but physical-board end-to-end smoke, TLS certificate hardening, signed firmware, rollback, and production provisioning still need completion before calling the device lifecycle fully production-ready.

Production-readiness gate now exists:

- Backend CLI: `npm run check:production` reports current deployment gaps without failing; `npm run check:production:strict` fails when required items are missing.
- Web Admin: platform admins can open Settings > `Triển khai` to see the same checklist.
- Current local/demo env is expected to be `BLOCKED` until the user supplies real third-party setup: Firebase Admin credentials, HTTPS API domain, Postgres URL, S3/R2 credentials, PHI key, and optional Brevo email/SMS/Zalo webhook/MQTT details.

## Firebase Setup

- Firebase project ID: `smart-health-stethoscope`
- Web app config is stored in web admin `.env.local` and `.env.production`.
- Firebase service account path:
  - `D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json`
- Admin UID used during setup:
  - `fQwjTYSCBOdGU5Hd0jbC1hkaaze2`
- Current local admin email `nguyengiabao100624@gmail.com` maps to Firebase UID `YOPbEgWu4pfRjMsbb8X5zOFBwUx1`. On 2026-05-26 the JSON demo DB was repaired from an older deleted UID, and backend Firebase login now updates a stale stored `firebaseUid` when a verified token matches by email.
- Admin custom claims used during setup:
  - `role=admin`
  - `organizationId=org_default_clinic`
- 2026-06-07: backend Firebase role normalization was fixed so raw custom claims `role=admin` or `role=platform_admin` become backend `role=admin` before workspace-role normalization. Before this fix, `role=admin` could be mapped to `workspace_admin`, making the Web Admin show Workspace Portal / hospital admin for a platform admin account. If this appears after deploy, sign out/sign in to refresh the Firebase ID token and verify `/api/me` returns `role=admin` plus `platform.*` capabilities.
- User confirmed the 2026-06-07 deployed fix works: signing in again with the platform/system admin account opens the correct platform admin experience.
- 2026-06-07 production RBAC persistence: Supabase migration `004_expand_user_roles.sql` expands `users.role` beyond the old `admin|doctor|patient` check, and `005_seed_default_organization.sql` seeds `org_default_clinic`. `npm.cmd run smoke:production-roles` passed against the Render backend, creating Firebase smoke accounts for platform admin and workspace admin and verifying `/api/me` capability separation. Smoke credentials are local-only in `web-monitor\.test-data\production-role-smoke-credentials.json`.
- 2026-06-07 Firebase Hosting: reserved `https://shcare.web.app` for the future patient/doctor web app and deployed the current Web Admin to `https://shcare-admin.web.app`. Web Admin uses `npm.cmd run build:firebase` and Firebase Hosting target `admin`; `shcare.web.app` intentionally returns 404 until the future web app is built/deployed. Chrome smoke on `shcare-admin.web.app` logged in with the platform smoke admin, showed `Platform Admin Console`, and loaded Render backend APIs with 200 responses.
- 2026-06-07 Web Admin auth boundary: `https://shcare-admin.web.app/` now waits for Firebase/backend auth before rendering the admin shell. A clean unauthenticated browser redirects to `/login`; an existing Firebase admin session opens dashboard directly; logout signs out Firebase and clears the backend token. Evidence screenshot: `D:\Study\KLTN\docs\report-evidence\2026-06-07-shcare-admin-login-redirect.png`.
- 2026-06-08 Web Admin Firebase Hosting cache hardening: `firebase.json` now sends `Cache-Control: no-cache, no-store, must-revalidate` for `shcare-admin` so browsers revalidate the SPA entry and do not keep an old auth-boundary bundle. If a browser still shows the old admin shell without login, do one hard refresh (`Ctrl+F5`) or open an incognito window once.
- 2026-06-08 CI/deploy runbook update: root GitHub Actions now includes `.github/workflows/smart-health-ci.yml` for backend check, workspace smoke, production readiness report, Web Admin Firebase build, Android debug compile, and ESP32-S3 normal/OTA firmware builds. `.github/workflows/deploy-web-admin.yml` is a manual Web Admin deploy workflow for `shcare-admin` once GitHub secrets are configured. Android has `app/google-services.ci.json`, a dummy compile-only Firebase config used only by CI when the real ignored `google-services.json` is absent. Backend script `npm.cmd run smoke:public-deployment` checks Render health, unauthenticated `/api/me` 401, and Firebase Hosting `/login` plus `/admin-actions` rewrites without needing secrets.
- 2026-06-08 platform-admin chrome copy: Web Admin `Layout` no longer displays the legacy default workspace `Smart Health Clinic` / `Phòng khám` in the sidebar footer for platform admins. The sidebar now shows a shorter `Quản trị hệ thống` badge and hides the workspace scope subtitle there; workspace admins still see their hospital/clinic workspace name and type. Topbar scope context remains unchanged.
- 2026-06-08 setup-guide readability: `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` was rewritten as a detailed Vietnamese guide with proper accents, covering GitHub Actions, Render env, Firebase Hosting deploy, admin creation, Brevo email/SMS/Zalo, Android, ESP32-S3 first flash, cloud OTA, and final smoke checks. The CI step 2 note now clarifies that a stale `Installed versions ... requirements.txt / pyproject.toml` message from an older run can be ignored if the latest run is green.
- 2026-06-08 outbound email update: Render Free blocks outbound SMTP ports, so backend email test now prefers Brevo Transactional Email API over HTTPS using `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, optional `BREVO_FROM_NAME`, and optional `BREVO_API_URL`. SMTP/Gmail stays as a fallback for paid hosts/local demos only. SMS/Zalo direct production providers are not free/stable; current implementation keeps the webhook relay path and moves direct SpeedSMS/eSMS/VietGuys/Zalo OA/ZNS adapters to future development.

Do not commit Firebase private keys, service-account JSON, `.env.local`, or `.env.production` unless the user explicitly requests and security is reviewed.

## Current Implementation Snapshot

Detailed status is in `SMART_HEALTH_IMPLEMENTATION_STATUS.md`. Short version:

- Firebase login and email verification are real.
- Android doctor signup now verifies email and submits a full doctor role request with clinic, specialty, CCHN, name, phone, and reason.
- Android doctor signup selects clinics/hospitals from a backend catalog with search and specialties from backend catalog; it must not show copy like "from admin" to the end user. The signup picker uses a dialog-style searchable list so long hospital/specialty catalogs remain tappable on mobile. If a hospital is missing, the doctor can request adding it from the signup list. Pending registration is persisted in SharedPreferences until email verification completes.
- Android doctor pending screen supports `needs_info`, lets the doctor update missing profile data, and resubmits the role request. Its clinic/specialty controls also use dialog-style searchable lists, matching signup behavior.
- Android app has a shared Compose motion layer in `ui/motion/SmartHealthMotion.kt`. `AppNavGraph.kt` applies fade/slide/scale transitions at `NavHost`, so all current routes get consistent professional screen transitions without per-screen wrappers.
- Doctor should stay on pending approval until web admin approves.
- Web admin login uses Firebase. Backend `/api/auth/firebase` self-heals stale JSON `firebaseUid` values when a verified Firebase token matches an existing email; this prevents recreated Firebase accounts from locking out an existing admin/user record.
- Web admin doctor approval path is wired to backend. On 2026-05-26, `/api/auth/role-request` was fixed to persist doctor role requests through the repository layer and create backend notifications with user/organization metadata, so the admin approval tab should list new pending doctors instead of only showing a notification. The approve modal uses a searchable clinic picker backed by `/api/catalog/clinics`, not a static select.
- Web admin Doctors delete now calls backend `DELETE /api/admin/doctors/:id`; backend deletes the linked Firebase Auth user first when `firebaseUid` exists, then removes backend user/session/membership/device-token/access links and writes `doctor.delete` audit. If Firebase deletion fails, the backend returns an error instead of silently leaving the Firebase account alive.
- Web admin Clinics management now has real actions: create, edit via `PATCH /api/admin/clinics/:id`, temporary lock/unlock via `status=inactive|active`, and delete via backend with in-use protection. Inactive clinics are hidden from the public signup catalog.
- Web admin capability gating now has a shared `AdminAccessContext` plus `action-permissions.ts`. Major create/edit/delete/share/export/admin buttons and dialogs are hidden or guarded by capabilities on Admin Actions, Packages, Clinics, Doctors, Devices, Patients, Storage, Notifications, and Doctor Approval. This is frontend guardrail only; backend `403` enforcement remains the production source of truth.
- Notifications, devices, scans, clinics, doctors, patients, audit, storage, and dashboard have partial real data. Core admin list pages should show loading/empty/error states instead of falling back to visual demo rows when backend loading fails.
- Admin table-style pages should paginate dense lists instead of rendering all rows on one page. Audit log, Clinics, Doctors, Patients, Storage files, and Doctor Approval tabs use a shared 10-row pagination footer.
- Export/report dialogs build sheets from live backend API results; smoke-test authenticated exports before treating them as production complete.
- Backend has production-looking schema and several production foundation utilities, but many handlers still use JSON-style runtime state.
- Firmware `MSM261S4030H0` has a first cloud-first slice: WiFi recovery AP, outbound backend WebSocket telemetry/audio, backend command handling, cloud OTA download/verify/install from manual URL or backend tokenized firmware file URL, and dev-only LAN ArduinoOTA disabled by default. It still needs physical ESP32-S3 smoke, secure NVS/certificate provisioning, signed firmware, buffering/resume, and production TLS hardening.

## UX/Design Source of Truth

Use current Smart Health design system:

- Light background: `#F5F7FA` or `#F5F7FF`
- Card: `#FFFFFF`
- Border: `#E2E8F0`
- Main text: `#0F172A`
- Secondary text: `#64748B`
- Primary Medical Blue: `#0B5C9A`
- Turquoise: `#00A896`
- Success: `#10B981`
- Warning: `#F59E0B`
- Error: `#EF4444`
- Font: Inter
- Admin web radius: 8-12px
- Icon style: lucide-like line icons

Do not introduce a separate style, neon/cyberpunk, glassmorphism, decorative orb backgrounds, or landing-page hero sections in the admin app.

## Common Verification Commands

Use `SMART_HEALTH_COMMANDS_GUIDE.md` for exact commands. Minimal checklist:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm run check
npm run smoke:workspace-access
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm run build:firebase
```

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

## Working Rules For Future Chats

- Read the context docs first.
- Read only relevant source files after that.
- Prefer `rg --files` and targeted `rg -n`.
- Prefer CodeGraph for structural symbol questions.
- Prefer Context7 for current library/framework/API docs.
- Do not revert user changes.
- Keep JSON demo mode working while adding production/Postgres paths.
- Preserve existing UDP/WSS demo audio until the production audio path is proven.
- After changing code/config/docs that affect future work, update these context files.

## 2026-06-05 Web Admin Basic Functions Completion

- Web admin basic function cleanup was completed after a dropped connection. Edits were preserved on disk; corrupted literal newline fragments in `Notifications.tsx` and `Doctors.tsx` were repaired.
- Added shared `ConfirmActionDialog` and removed remaining `window.confirm`/`alert(` usage from admin source. Delete/danger flows now use styled modal/toast on Clinics, Packages, Storage bucket/bulk file actions, Storage file detail, Notifications delete-all, and Doctors staff actions.
- Account Settings is now API-backed: `/api/me` saves profile fields (`name`, `title`, `phone`, `license`, `hospital`, `department`, `address`, `specialty`, `avatarFileId`, `avatarUrl`); email is readonly because Firebase Auth remains identity source. Avatar upload uses storage bucket `avatars`; session list/revoke uses `/api/auth/sessions`.
- System Settings is now controlled state backed by `/api/settings`. It covers `system`, `branding`, `notifications`, `privacy`, `storage`, `stethoscope`, `ai`, `outbound`, and `securityPolicy`. Logo upload uses bucket `avatars` and saves `branding.logoFileId/logoUrl`.
- Added Brevo email API/SMTP fallback and SMS/Zalo webhook support in backend settings. Email test prefers Brevo HTTPS API with env `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, optional `BREVO_FROM_NAME`, and optional `BREVO_API_URL`; SMTP/Gmail still works through `nodemailer` only as fallback with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. SMS/Zalo test posts webhook payload `{ channel, to, message, templateId?, metadata? }` using `OUTBOUND_WEBHOOK_URL` or settings webhook URL; optional secret is `OUTBOUND_WEBHOOK_SECRET`.
- Backend demo fallback now prefers an admin user for no-token local admin smoke, so web admin demo pages do not inherit patient permissions just because JSON DB order changes.
- Verification on 2026-06-05: `npm.cmd run check` in `web-monitor` passed, `npm.cmd run build` in web admin passed, source scan found no `window.confirm`/`alert(` in admin source, API smoke showed `/api/me` admin, `/api/auth/sessions` list, `/api/settings` runtime status, and clear 400 errors when SMTP/webhook config is missing.

## 2026-06-06 Login/Auth And Font Fix

- Root cause of the reported admin login failure was runtime mismatch: web admin `.env.local` uses `VITE_AUTH_MODE=production` and Firebase Web Auth, but the backend process on port 3000 had been started in demo mode. Restarting backend with `AUTH_MODE=production`, `FIREBASE_AUTH_ENABLED=true`, `FIREBASE_PROJECT_ID=smart-health-stethoscope`, `GOOGLE_APPLICATION_CREDENTIALS=D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json`, and `DATA_BACKEND=json` fixed the mismatch.
- Use the `cmd /c set "KEY=value" && node server.js` production start command in `SMART_HEALTH_COMMANDS_GUIDE.md`; inline PowerShell `Start-Process -Command` was observed to strip quotes and accidentally start demo mode.
- Web admin `smart-health-api.ts` now clears stored admin tokens on HTTP 401 from JSON/blob requests, preventing stale localStorage tokens from keeping the UI stuck on an invalid-session state.
- Actual mojibake strings were repaired in admin source (`Clinics`, `Doctors`, `Notifications`, `Packages`, `Storage`, `FileDetailDialog`) and one backend patient-profile error string. Python UTF-8 scan now has no admin mojibake hits except the intentional `includes("�")` guard in `error-messages.ts`.
- Browser smoke at `http://127.0.0.1:5174/login` shows correct Vietnamese text, label/autocomplete issues fixed, and invalid credentials now show `Email hoặc mật khẩu không đúng.` via Firebase instead of backend session mismatch. Evidence screenshots were saved under `D:\Study\KLTN\docs\report-evidence\2026-06-05`.
## 2026-06-06 Clinic Delete Note

- `Smart Health Clinic` maps to `org_default_clinic` in JSON mode. As of the latest check, it still has linked backend records: 4 accounts, including 1 doctor, and 4 patients. Delete is expected to be blocked until those records are transferred or removed.
- Backend workspace counts now come from a shared link-summary helper and count doctors from real `role: "doctor"` as well as `requestedRole: "doctor"`.
- Clinic delete conflicts now return `WORKSPACE_IN_USE` with structured details. The web admin modal/toast reads those details and shows accounts/doctors/patients/devices separately.

## 2026-06-06 Workspace Admin Smoke Account

- A real Firebase workspace-admin demo account now exists for browser smoke: `workspace.admin.demo@smarthealth.test`, role `workspace_admin`, organization `org_workspace_demo_hospital` / `Bệnh viện Demo Workspace`.
- Backend Firebase claim ingestion now accepts `workspace_admin`/`workspace_owner` and upserts them as scoped workspace users instead of rejecting them as non-admin. Firebase custom claims are `{ role: "workspace_admin", organizationId, smartHealth: { role, organizationId } }`.
- `web-monitor/scripts/createWorkspaceAdmin.js` creates/updates this Firebase user, sets custom claims, upserts the JSON organization/user/membership, and seeds one demo doctor, patient, and device for the hospital. Use `WORKSPACE_ADMIN_PASSWORD` to set a known local demo password; otherwise the script generates one.
- Web admin layout now clearly shows access mode: `Admin bệnh viện`, workspace name, and `Bệnh viện` badge. Platform-only routes such as global packages and doctor approval are hidden and direct navigation shows `Không có quyền truy cập`.
- Workspace settings are scoped: `/api/settings` returns `scope: { type: "workspace", organizationId, name }`, and `PATCH /api/settings` writes to `organization.settings` for workspace admins instead of global `db.settings`.
- 2026-06-08: Platform admin no longer needs a terminal script for the normal admin-account workflow. Web Admin sidebar now includes `Hành động quản trị`; that page has `Tạo tài khoản admin`, backed by `POST /api/admin/admin-users`. The route requires `platform.users.manage`, creates a Firebase Auth user, sets custom claims `{ role, organizationId, smartHealth }`, saves backend user/membership through repositories for JSON/Postgres parity, audits `admin.user.create`, and rejects existing emails to avoid accidental password resets.

## 2026-06-06 Admin Settings/Account Function Unlock

- Account Settings now has backend-backed demo functions for profile notification preferences, app/SMS 2FA state, recovery codes, avatar upload/link/clear, session list, session revoke, and logout-all-other-devices. Avatar upload uses `POST /api/admin/storage-files?bucket=avatars` with the image body, then stores `avatarFileId/avatarUrl` through `PATCH /api/me`.
- System Settings now exposes real backend actions for backup status check, workspace API key create/rotate/revoke, and local-demo AI model update. These no longer stay disabled/no-op in the KLTN demo.
- Branding logo upload follows the same storage path as avatar and saves `branding.logoFileId/logoUrl` through `PATCH /api/settings`; the backend also returns `previewUrl` for uploaded image storage records.
- Workspace-admin settings no longer expose platform API keys. `/api/settings` filters `securityPolicy.apiKeys` so hospital admins only see/manage workspace-scoped keys.
- Backend is currently running locally in Firebase production mode on port `3000`, and the web admin dev server is running on `http://127.0.0.1:5174`.
- Browser smoke evidence screenshot for the unlocked workspace settings page was saved at `D:\Study\KLTN\docs\report-evidence\2026-06-05\screenshots\web-admin-settings-workspace-unlocked-20260606.png`.

## 2026-06-06 KLTN Product-Readiness Hardening

- Firmware `MSM261S4030H0/src/main.cpp` no longer hangs forever when WiFi is missing or cannot connect. It loads WiFi credentials from ESP32 NVS with build flags as fallback, then starts AP `SmartHealth-<suffix>` and serves WiFi recovery at `http://192.168.4.1` when reconnect is needed.
- The local recovery portal saves only WiFi SSID/password to ESP32 Preferences namespace `smart-health` and restarts the board. Backend host, device id, device secret, firmware, ownership, and admin actions are managed by backend/Web Admin, not by the ESP local page.
- Android `app/build.gradle.kts` now keeps debug default `http://10.0.2.2:3000`, but release builds require `-PSMART_HEALTH_BASE_URL=https://...` and reject `localhost`, `127.0.0.1`, `0.0.0.0`, and emulator `10.0.2.2`.
- Web admin now has product build guard. `npm.cmd run build:product` validates `VITE_AUTH_MODE=production`, requires HTTPS `VITE_SMART_HEALTH_BASE_URL` and `VITE_SMART_HEALTH_API_BASE_URL`, and rejects local backend hosts. The API client also throws a clear production-runtime error if a built admin app is deployed with a local backend URL.
- Verification on 2026-06-06: backend `npm.cmd run check` passed; backend `npm.cmd run smoke:workspace-access` passed; web admin `npm.cmd run build` passed; web admin `build:product` without real URL failed intentionally; web admin `build:product` with sample HTTPS URL passed; Android `:app:compileDebugKotlin` passed; Android release without URL failed intentionally with a clear error; Android release with sample HTTPS URL passed; firmware PlatformIO build passed.
- Hardware flash/serial smoke is still pending because current `platformio device list` only shows COM3/COM4 Bluetooth serial links, not the ESP32-S3/COM6 board.

## 2026-06-06 Cloud Device Control, WiFi Recovery, And OTA

- `MSM261S4030H0` firmware no longer keeps a local device-admin server as the main management surface. Normal management happens through the main Smart Health Web Admin and backend cloud.
- If saved WiFi is missing or fails, the ESP falls back to AP `SmartHealth-<suffix>` at `http://192.168.4.1`. That portal only accepts WiFi SSID/password so a hospital/classroom/home WiFi can be changed without reflashing.
- After WiFi reconnects, the ESP opens an outbound backend WebSocket/WSS connection for telemetry, realtime audio frames, device events, and cloud commands. Web/admin/app do not need to be on the same WiFi as the ESP.
- Product OTA is cloud OTA: Web Admin sends firmware version, HTTPS URL, and checksum to backend; backend delivers the command to the ESP; ESP downloads, verifies SHA-256 when provided, writes OTA partition, emits OTA events, and reboots.
- LAN ArduinoOTA/espota remains dev-only behind `SMART_HEALTH_ENABLE_LAN_OTA=1`. Browser `.bin` upload on the ESP and local OTA password editing are not the product path.
- The unavoidable limitation remains: a blank ESP32-S3 still needs one first wired flash or factory provisioning image before WiFi recovery/cloud management/OTA can exist on the device.
- Verification on 2026-06-06: `platformio run -e esp32-s3-devkitm-1` passed; `platformio run -e esp32-s3-ota` passed. Real board cloud heartbeat/audio/OTA evidence still needs the ESP32-S3 connected and configured.
- 2026-06-08 update: Web Admin now has a dedicated `/admin-accounts` page under `Admin Actions` for platform admins with `platform.users.manage`. It lists admin accounts, lets the platform admin create/update/lock/unlock/reset/delete them, and no longer requires terminal-only scripts for the normal admin-account workflow. Account Settings now uses dedicated `/api/me/avatar` upload/download/delete flows, and the password form uses Firebase re-auth/updatePassword in production before backend confirmation. Backend `PATCH /api/admin/admin-users/:id` now only treats role/workspace as changed when values actually differ, so editing your own name/title/phone no longer trips the self-role guard.

## 2026-06-08 Avatar, Password Reset, And Mojibake Cleanup

- Runtime source scan now has no mojibake hits in `smart-health-admin\thiết kế giao diện\src`, `web-monitor\server.js`, or `web-monitor\src`; the Storage labels are `Hoạt động gần đây` and `Gần đây`. When inspecting Vietnamese files in Windows PowerShell, use `Get-Content -Encoding UTF8` so the terminal does not misread correct UTF-8 as mojibake.
- Backend user-facing permission/error strings in `server.js` were also normalized from old no-accent copy such as `Khong co quyen...` to proper Vietnamese for account, admin-account, storage, workspace, doctor, settings, export, and sharing flows.
- Forgot Password now uses Firebase Web Auth `sendPasswordResetEmail` instead of a frontend-only timeout. Real email delivery depends on Firebase Email/Password being enabled and the hosting domain being authorized in Firebase.
- If `/forgot-password` reports Firebase Authorized Domain errors, add `shcare-admin.web.app` in Firebase Console > Authentication > Settings > Authorized domains. The app now maps `auth/unauthorized-domain` and `auth/unauthorized-continue-uri` to setup-specific Vietnamese messages instead of the generic expired-session copy.
- Account avatar upload now allows `X-File-Name` through backend CORS, sends S3 `ContentLength`, persists `avatarStorage` metadata in the user profile, serves `/api/me/avatar` through the backend from object storage, and deletes/replaces the previous avatar object when updating or removing the avatar.
- Password-change notifications now use correct Vietnamese copy and are scoped to the current user instead of being emitted as unscoped/global notifications.
- Email test now maps Brevo API and Gmail/Nodemailer fallback failures to clear 400 messages and uses short timeouts so Web Admin does not sit on `Đang gửi...` for a long time. For Render Free, use Brevo API envs first; Gmail SMTP fallback is only practical when the host permits SMTP.

## 2026-06-08 Platform Admin Notification Email Fanout

- All backend-created Web Admin notifications now queue a branded HTML email to active platform/system admin accounts only.
- The notification email template includes Smart Health branding, severity badge, message, timestamp, workspace/user context, sanitized metadata, and a CTA to `WEB_ADMIN_URL/notifications`.
- Delivery reuses the existing outbound email stack: Brevo Transactional Email API over HTTPS first for Render Free, SMTP/Gmail only as fallback when the host permits SMTP.
- Required/important env: `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, optional `BREVO_FROM_NAME`, optional `BREVO_API_URL`, `WEB_ADMIN_URL=https://shcare-admin.web.app`, and optional emergency switch `NOTIFICATION_EMAIL_ENABLED=false`.
- Workspace/hospital admin email fanout is intentionally not enabled yet; define notification policy and preferences before expanding recipients beyond platform admins.

## 2026-06-12 Android Core MVP Completion Pass

- Android APK debug default now points to the public Render backend `https://smart-health-api-xj0a.onrender.com`; local emulator backend is still available with `-PSMART_HEALTH_BASE_URL=http://10.0.2.2:3000`.
- Android startup no longer assumes the local backend. `SplashScreen` runs backend health preflight, restores Firebase session with refreshed ID token, authenticates through `/api/auth/firebase`, then routes to doctor dashboard, patient dashboard, doctor approval pending, verify-email, or login.
- Notification permission is no longer requested from `MainActivity` on cold launch. It is requested only from Notification Settings after a Vietnamese pre-prompt when the user enables notifications.
- Mobile UI cleanup removed the visible SMS login button until a real SMS provider exists, removed fake personal placeholders and hardcoded doctor name, and replaced technical `backend cloud` wording in core Android screens with product wording.
- Medical Records sharing no longer asks for raw `doctorUserId`/`workspaceId`. Backend adds authenticated `GET /api/share-targets?q=`, and Android uses a searchable doctor/workspace picker before calling the existing patient-share API.
- Android CodeGraph was initialized in `D:\Study\KLTN\smart-health-android` for local agent navigation. Treat `.codegraph/` as local tool state unless the repo intentionally starts tracking it.

## 2026-06-12 Doctor Request-Info Sync Fix

- Doctor approval `request-info` now hardens the full loop: backend persists `needs_info`, request message, and required fields in repository-backed mode; `/api/auth/firebase` reloads the latest user by Firebase UID/email before returning status to Android.
- Web Admin Doctor Approval controls the active tab and immediately moves a row into `Cần bổ sung` after `request-info` succeeds instead of relying only on a later full reload.
- Android `DoctorApprovalPendingScreen` polls pending/needs-info status every 15 seconds, shows the admin message, lists required fields, and maps `doctor_info_requested` notifications as warnings.
- Emulator smoke installed/launched debug APK on `emulator-5554`; the app opened the doctor pending screen and crash buffer stayed empty.
- Deployed on 2026-06-12: commit `4e8548e` was pushed to `origin/main`, Render picked up the backend change, Firebase Hosting release `f13b8b22666bc3cd` went live for `https://shcare-admin.web.app`, `/api/share-targets` changed from old `404` to new unauthenticated `401`, and `npm.cmd run smoke:public-deployment` passed.
- Follow-up production fix on 2026-06-12: production still kept the row in `pending` because repository saves passed empty strings into Postgres `timestamptz` columns (`role_approved_at`, `role_rejected_at`, `role_info_request_at`). Postgres rejected the save while the old repository fallback hid the error. Commits `951c82c` and `7f1cdef` added guarded direct request-state persistence plus `optionalTimestamp(...)`. Verified on Render: `baobee1006@gmail.com` moved from `pending` to `needs_info`, pending count became 0, needs-info count became 1, and the doctor Firebase token sees `roleRequestStatus=needs_info` with message and fields.
- Resubmit follow-up on 2026-06-12: Android was correctly polling, but `/api/auth/role-request` returned `pending` from the in-memory user while the SQL row could remain `needs_info`. Backend now uses guarded direct repository writes for the full doctor request lifecycle: doctor resubmit resets `needs_info -> pending` and clears request-info fields; admin approve/reject/request-info also verify the persisted status after SQL `RETURNING`. `npm.cmd test` includes a regression for `pending -> needs_info -> resubmit -> pending`.
- Registration reason follow-up on 2026-06-12: Android already submitted `reason`; backend now persists/returns `registrationReason` through repository-backed users, Web Admin Doctor Approval prefers that value over old fallback copy, and platform-admin notification emails include the real reason plus doctor metadata with CTA to `/doctor-approval`. Backend smoke now verifies `registrationReason` through first submit, admin request-info, doctor resubmit, auth polling, and admin pending list.
- Deployed registration reason fix on 2026-06-12: commit `4ce7915` pushed to `origin/main`, Firebase Hosting Web Admin version `5124335308359eb3` released, public deployment smoke passed, and production canary for `baobee1006@gmail.com` verified `registrationReason` in `/api/auth/firebase`, Web Admin pending list, and notification metadata used by Gmail email fanout.

## 2026-06-24 Smart Health Web Premium UI Pass

- `PublicLayout.tsx` now keeps the public header above light-mode content, transparent at the top, and translucent only after scrolling. Product/solution menus use a state-backed hover/focus delay and bridge so child links remain reachable.
- `HomePage.tsx` now has a full-width cinematic hero treatment, capability proof cards, and a device-to-portal handoff explanation. Public pages inherit a quieter shared background treatment.
- Login and registration are compact on desktop and restore a full-width one-column layout on mobile to prevent overflow.
- Targeted Prettier/ESLint and `bun run build` passed. Chrome DevTools covered `/`, `/login`, and `/register` at 1440px light/dark and 500px mobile with no horizontal overflow. During UI-only QA, `127.0.0.1:3000/api/me` will be refused unless the local backend monitor is running.

## 2026-06-24 Web Visual, Motion, And Hosting Release

- `HomePage.tsx` now uses the local `MẪU UI UX/bacsi.mp4` as the full-bleed hero video. The old white/black wash element was removed. The current implementation uses two synchronized video layers: a sharp main layer and a masked blurred edge layer, so the doctor/child center remains clear while only the outer corners/edges soften.
- `PublicLayout.tsx` owns the header backdrop inline so the initial state is provably `backdrop-filter: none` with no surface. After scroll it becomes a low-opacity water-glass pill at `blur(44px) saturate(195%)`.
- Homepage reveal transitions are now actual `motion/react` viewport animations with alternating left/right entries, fade, blur-clear, scale settle, and stagger. Product, pricing, and contact receive equivalent CSS scroll-timeline reveals when reduced-motion is not requested.
- Deployed Firebase Hosting site `shcare` on 2026-06-24: version `7bafbc088d49e939`, live at `https://shcare.web.app`.
- Production browser check confirmed: video readyState `4` and playing, no hero wash node, top header background transparent with `backdrop-filter: none`, scrolled header is `rgba(248,255,253,0.3)` with `blur(44px)`, and there is no horizontal overflow.

## 2026-06-25 Public Web Fit And Motion Follow-up

- `smart-health-web` local UI was adjusted after feedback that desktop motion was not visible enough and mobile still had fit issues. `PublicLayout.tsx` now keeps reveal targets observed and toggles them between `pending` and `visible` as they enter/leave the viewport, so desktop scrolling can re-trigger left/right/up movement instead of only firing once.
- `HomePage.tsx` viewport reveals now use `once: false`, a lower viewport threshold, and a longer easing duration so scroll movement is easier to see on desktop.
- `signal-horizon.css` adds a final fit/motion polish layer: no-purple teal/clinical palette lock, more transparent scrolled water-glass header, box-free inline hero trust markers, more transparent hero preview HUD, stronger desktop reveal offsets, smaller mobile reveal offsets, and tighter mobile hero/preview/auth sizing to prevent horizontal overflow.
- Verification passed locally: Prettier, targeted ESLint for `PublicMotionContext.ts`, `PublicLayout.tsx`, `HomePage.tsx`, `bun run build`, and `bun run build:firebase`. Firebase build output includes CSS asset `index-BSdxiKdV.css`, JS asset `index-CfcxVhIe.js`, and `bacsi-CH0Km87A.mp4`.
- Deployment was attempted from the Codex sandbox but did not complete: `npx firebase-tools@13.35.1` stalled on registry dependency fetches, and the cached Firebase CLI could not authenticate because sandbox network/ACL blocked Google OAuth/configstore access. Treat `https://shcare.web.app` as still serving the last confirmed deployed version until the deploy command is run from a normal local terminal or CI with Firebase credentials/network access.

## 2026-06-30 Public Web Mobile, Motion, Scroll, And Portal Link Fix

- Fixed the mobile homepage proof-card regression where desktop `grid-column: span 5/7` leaked into a one-column phone grid and squeezed cards into a thin vertical strip. The final `signal-horizon.css` override resets public page grids/cards to one column on phones and keeps mobile reveal motion vertical only.
- Route changes now reset scroll position in `PublicLayout`, `AuthLayout`, and `PortalLayout`, so navigating from a scrolled page opens the next route at the top.
- Homepage scroll reveals now use a DOM-visible IntersectionObserver state (`data-shc-home-reveal-state=pending/visible`) instead of relying only on `motion/react whileInView`. Content is readable by default, then animates left/right/up on desktop and gently upward on mobile. The public motion toggle is now authoritative: default respects OS reduced-motion, but choosing `Bật hiệu ứng` stores `shc-public-motion=enabled` and actually re-enables the choreography.
- Light/dark contrast and fit were hardened for public/auth/portal text, inputs, placeholders, and the new portal backend status pill. `smartHealthApi.portalStatus()` calls `GET /api/portal/status`; the portal topbar shows `BE online`, `BE lỗi`, or checking state from the backend instead of being purely static.
- Verified locally with Chrome DOM checks at 390px and 1440px: mobile proof cards have `scrollWidth=clientWidth`, each card spans the viewport width, desktop reveal transitions move from pending offset/blur to visible, and route navigation resets scroll from `1700 -> 0`.
- Verification passed: targeted ESLint, `bun run build`, backend `npm.cmd run check`, backend `npm.cmd test`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, and `bun run build:firebase`.
- Deployed Firebase Hosting site `shcare` on 2026-06-30: version `cc264fa1be69d04a`, live release `1782759036395000`, URL `https://shcare.web.app`. Live smoke confirmed `/` and `/login` HTTP 200, HTML `Cache-Control: no-cache, no-store, must-revalidate`, assets `index-DftUVpnd.css` and `index-DNVNrv9k.js`, mobile proof cards fitting at 390px, and Render `/api/health` HTTP 200.
- `npm.cmd run check:production` still reports `BLOCKED` in a local shell without production envs. Full BE production completion still requires real Firebase Admin env, Postgres `DATABASE_URL`, S3/R2 object storage, `PHI_ENCRYPTION_KEY`, email/SMS provider env, and production smoke with authenticated accounts.

## 2026-06-30 Public Web Build Recovery, Code Split, And Redeploy

- `smart-health-web` root build/deploy files were restored after the manifest/config went missing: `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.firebase.config.ts`, `index.html`, `firebase.json`, `.firebaserc`, `bunfig.toml`, and `eslint.config.js`.
- `src/app/routes.tsx` now lazy-loads public/auth/portal layouts and pages through React Router route `lazy`, with direct `hydrateFallbackElement` on the route groups. This keeps first-load JS under the Vite 500 kB warning threshold and removes the React Router HydrateFallback console warning.
- Firebase production build uses `VITE_AUTH_MODE=production`, `VITE_SMART_HEALTH_API_BASE_URL=https://smart-health-api-xj0a.onrender.com/api`, and `VITE_PUBLIC_SITE_URL=https://shcare.web.app`. Current live assets are `index-BQJHr-Te.css` and `index-e8iN3TOO.js`; route chunks are split separately.
- Backend `smoke:workspace-access` now verifies `/api/portal/status` for portal workspace users and ensures platform admins are rejected from the portal surface.
- Deployed Firebase Hosting `shcare` again on 2026-06-30: version `b4872b04beaabdec`, live release `1782803246138000`. Live Chrome smoke confirmed mobile 390px no overflow, route scroll reset, desktop reveal animation, and no console warnings/errors.

## 2026-07-01 Shcare Hero Seam, Production Strict, And Authenticated E2E

- `smart-health-web` home hero now keeps the first viewport dark in light or dark mode, then fades into the light content through a scroll-progress bridge instead of cutting directly from dark video to white page body.
- `PublicLayout.tsx` writes `--shc-hero-exit-progress` from scroll position and starts the transition earlier while the proof section approaches the viewport. `signal-horizon.css` supplies the dark-to-light gradient bridge on the hero/proof boundary.
- Deployed Firebase Hosting site `shcare`: version `projects/162993928259/sites/shcare/versions/ea356aa73da03f62`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782903091097000`, URL `https://shcare.web.app`.
- Live Chrome QA on `https://shcare.web.app/?qa=hero-live-final-20260701` confirmed no horizontal overflow, top hero state `active/progress=0`, desktop seam/rest state before the light body becomes dominant, and no console warnings/errors.
- Authenticated live E2E passed with Firebase ID-token login and Render `/api/auth/firebase` for role accounts `workspace_facility_smoke` (`workspace_admin`) and `doctor_portal_canary` (`doctor`, approved). Read-only portal endpoints passed for status, overview, patients, devices, scans, notifications, reports, and audit log.
- Backend contract follow-up fixed a route drift: `GET /api/v1/devices/:id/events` is now handled by the device route with device-view scope checks, and notification delete no longer passes through an unrelated device-management assertion. `npm.cmd run smoke:workspace-access` now covers own/cross-workspace device events plus `/api/portal/notifications/:id` delete.
- Follow-up BE hardening expanded `npm.cmd run smoke:workspace-access` into the main Shcare Portal backend-contract smoke: public contact, portal status/overview/monitoring/reports/audit, patient create/update/delete, patient share/revoke, scan note update, device assign/command, staff create/list, settings/workspace patch, account notification preferences, share-target scoping, notification read/read-all/delete, device-event scoping, and cross-workspace denials now pass locally.
- Important correction: do not ask the user to recreate Render/Firebase/Supabase from scratch. Earlier docs confirm Render backend `https://smart-health-api-xj0a.onrender.com`, Firebase Hosting/Auth, Supabase Postgres, and Supabase Storage S3-compatible setup were already completed. Local `npm.cmd run check:production:strict` can still return `BLOCKED` because the local PowerShell process does not contain Render secret envs; treat that as a local-env check unless querying the actual host env with Render access.
- 2026-07-01 BE deploy verification: commit `409a3592` (`Fix portal backend route contract`) was pushed to `origin/main` for Render auto-deploy. Local verification passed with `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:workspace-access`, and `npm.cmd run smoke:repositories`. Live verification passed with `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, and a doctor view-only canary where `doctor.viewer.smoke@smarthealth.test` had `workspace.devices.view` but no `workspace.devices.manage` and still received HTTP 200 from `GET https://smart-health-api-xj0a.onrender.com/api/v1/devices/lite-steth-a92/events`.
- 2026-07-01 production tooling follow-up: commit `71a38f3e` (`Add backend production smoke tooling`) was pushed to `origin/main`. Backend `npm start` now runs `scripts/start.js`, which applies SQL migrations first when `DATABASE_URL` is present, then starts `server.js`. Migration `006_secure_public_tables.sql` enables RLS and revokes direct Supabase `anon`/`authenticated` table access because clients should go through the Render backend. `smoke:public-deployment` now checks `shcare.web.app` rewrites as well as admin/backend, and `smoke:repositories` is tracked. Verification after push: `npm.cmd run smoke:public-deployment` and `npm.cmd run smoke:production-roles` passed.
- 2026-07-01 portal auth hotfix: live `shcare.web.app` was showing "Không thể kết nối backend Smart Health" on login/register because the deployed portal JS bundle had been built without `VITE_SMART_HEALTH_API_BASE_URL` and fell back to `http://localhost:3000/api`. Rebuilt `smart-health-web` with `VITE_AUTH_MODE=production`, `VITE_SMART_HEALTH_API_BASE_URL=https://smart-health-api-xj0a.onrender.com/api`, Firebase web envs from the existing web-admin `.env.production`, and `VITE_PUBLIC_SITE_URL=https://shcare.web.app`; deployed Firebase Hosting site `shcare` version `projects/162993928259/sites/shcare/versions/e59c69dd22c36505`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782921251706000`. Live verification: main bundle `assets/index-DFyy8ZDC.js` has `localhostCount=0` and `renderApiCount=1`; browser CORS fetch from `shcare.web.app` to Render `/api/health` returned 200 and unauthenticated `/api/me` returned expected 401; `npm.cmd run smoke:public-deployment` passed.
