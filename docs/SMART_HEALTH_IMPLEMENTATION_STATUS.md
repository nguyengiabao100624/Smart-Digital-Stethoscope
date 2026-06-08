# Smart Health - Implementation Status

Last updated: 2026-06-08

This file records the real project state. Keep it factual: implemented, partial, scaffold, or not done. Update this file after every meaningful Smart Health code/config change so future new chats can avoid re-reading the whole codebase and reduce quota/token usage.

## Status Legend

- Real: implemented and used by runtime.
- Partial: some real integration exists, but important paths still use mock/demo/scaffold logic.
- Scaffold: structure exists but is not the primary runtime path.
- Not done: planned only.

## Summary Matrix

| Area | Status | Current reality |
| --- | --- | --- |
| Firebase Auth | Real/partial | Android and web admin use Firebase. Backend can verify Firebase ID tokens. Claims/session refresh UX still needs hardening. |
| Doctor registration and approval | Real/partial | Android doctor registration verifies email and sends role request with persisted pending metadata, searchable hospital/clinic catalog selection, missing-hospital request, specialty, license, phone, name, and reason. Web admin can list/approve/reject/request-info/delete; the approve modal uses a searchable clinic picker backed by the clinic catalog. Backend exposes clinic/specialty catalogs, persists structured request-info fields, and deletes linked Firebase Auth users before deleting doctor backend data. Pending/dashboard route edge cases should still be E2E-tested. |
| Backend API foundation | Partial | Request/error/audit/repository foundations were started. Legacy routes still exist and must remain compatible. |
| Backend persistence | Partial | JSON mode works for demo. PostgreSQL schema and repository foundation exist, but not every runtime handler uses normalized tables yet. |
| Workspace/Organization/RBAC | Partial | `organizations` is now treated as workspace source of truth in JSON mode, with `workspaceType` (`hospital`, `clinic`, `solo_practice`, `personal`), subscription/package fields, usage/quota summary, `/api/admin/workspaces` alias, and package assignment endpoint. `/api/me` returns workspace context and backend-derived capabilities for role-aware UI. `/api/admin/*` now accepts non-platform workspace roles through capability checks instead of hardcoding `role=admin`. Patients/family profiles, devices, scans, storage/signed URLs, exports, packages, workspace CRUD, doctor/staff actions, settings/AI updates, data delete, and sharing have first-pass backend enforcement and workspace scoping in JSON/demo mode. `npm run smoke:workspace-access` verifies six roles and cross-workspace failures. Repository-backed parity and complete OpenAPI coverage are still pending. |
| Service packages and billing | Partial | Backend service packages are real JSON data with segment, quota, CRUD update/delete, default clinic/solo/personal packages, and workspace package assignment. Web admin Packages page reads backend data and now labels device quota as activated devices; personal package patient quota is presented as family profiles, not one device per patient. Payment provider, invoices, and quota enforcement are not done. |
| Web admin UI | Partial production | High-fidelity UI exists. Core admin list pages are connected to backend and no longer fall back to visual demo rows on load failure. Dense admin tables now use shared 10-row pagination on Audit log, Clinics, Doctors, Patients, Storage files, and Doctor Approval tabs. Clinics/workspace management create/edit/lock/unlock/delete actions call real backend APIs, and workspace filters include organization, solo practice, and personal segments. Sidebar rendering, topbar Platform/Workspace labeling, first-pass route-level blocking, and major action/button/dialog gating now understand `/api/me` capabilities. Overview now distinguishes Platform Admin Console vs Workspace Portal and exposes Workspace Portal v1 modules. Firebase Hosting admin now has a real auth boundary: unauthenticated `/` redirects to `/login`, existing Firebase admin sessions open dashboard directly, and logout signs out Firebase plus clears the backend token. Technician device provisioning no longer sends an arbitrary workspace id unless the user is platform admin. Full portal information architecture and every dialog's field-level policy still need browser E2E. |
| Storage admin | Partial | Storage API/work has been planned and partly implemented. Verify current backend routes before relying on upload/share/delete/download as production-ready. |
| Notifications | Partial | Notification list/read/delete and topbar logic have been worked on. FCM token registration/delivery/retry is not complete. |
| Android motion/animation | Real | Shared Compose motion layer is applied through `AppNavGraph.kt`, giving all routes consistent fade/slide/scale screen transitions. Element-level micro-interactions can still be expanded screen by screen later. |
| Android workspace onboarding | Partial | Signup now distinguishes personal user, solo doctor, and doctor belonging to a health facility. Solo doctor sends `workspaceType=solo_practice`; personal user sends `workspaceType=personal`; facility doctor still uses searchable clinic catalog plus specialty and optional missing-clinic request. Android New Scan now lists/creates family/dependent patient profiles and sends the selected `patientId` before starting a scan. Medical Records has a first share action for a scan/profile to a doctor/workspace. Full workspace switcher, dashboard-by-workspace, and polished family management screens are not complete. |
| Device management | Partial cloud-first | Device inventory and UI exist. `/api/devices` list and management actions are scoped by workspace/capability in JSON/demo mode. Backend now accepts outbound ESP WebSocket registration, heartbeat telemetry, device events, command delivery, event history, manual URL OTA, and storage-backed OTA command creation with tokenized firmware download URLs. Web Admin Devices page shows cloud status/events and sends restart/revoke/rotate/OTA through backend. MQTT/certificate hardening and physical-board E2E remain pending. |
| Audio ingest | Partial cloud-first | Legacy MSM261 UDP audio remains as development fallback. MSM261 firmware now attempts outbound WebSocket/WSS audio streaming to backend first, while backend fans ESP audio to listener clients. Android sends the current bearer token on the live WebSocket request. Backend WSS auth enforcement, TLS hardening, buffering, and durable HTTPS chunk upload remain pending. |
| AI pipeline | Demo/scaffold | Scan stop can produce local audio/quality-style result. No real queue/model pipeline yet. |
| Object storage | Scaffold/partial | MinIO/S3 direction is chosen. Local storage fallback remains important. Signed URL and quota/retention need verification/completion. |
| Firmware production | Partial cloud-first | ESP32 code avoids committed secrets, has WiFi recovery AP, outbound backend WebSocket telemetry/audio, backend command handling, and HTTPS cloud OTA with SHA-256 verification. LAN ArduinoOTA is dev-only and disabled by default. Secure NVS/certificate provisioning, signed firmware, rollback, buffering, and real-board validation remain pending. |
| CI/CD and monitoring | Partial | GitHub Actions now checks backend, workspace access smoke, production readiness report, Web Admin Firebase build, Android debug compile, and ESP32-S3 normal/OTA firmware builds. A manual Web Admin Firebase Hosting deploy workflow exists for `shcare-admin` once GitHub secrets are configured. Metrics, alerts, backups, and full release automation are still pending. |
| Production readiness gate | Real/checker | Backend has a readiness CLI, strict deploy gate, platform-only readiness API, Web Admin deployment tab, production env example, and third-party setup runbook. The current local/demo env is intentionally blocked until real Firebase/Postgres/S3/HTTPS/secret setup is supplied. |
| Context/new-chat handoff | Real | Context docs and AI skill docs exist. KLTN report evidence summary, report-ready Word copy, and final evidence Word copy were added on 2026-06-05. |

## Product Direction

- Canonical remote-first product direction is documented in `D:\Study\KLTN\docs\SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`.
- Smart Health is positioned around connected device deployment, realtime remote monitoring, stored clinical audio, AI support, sharing, and workspace administration; it is not an in-room traditional stethoscope replacement.
- One activated device can measure many patient profiles. Device quota means activated/deployed machines in a workspace.
- Personal/family workspaces should support multiple family/dependent patient profiles under one account; separate accounts for every family member are optional, not required.
- Clinic/hospital management is web-first through a Workspace Portal. The existing web admin should evolve into role-aware Platform Admin Console and Workspace Portal modes.

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
- `/api/auth/role-request` persists doctor role requests through `repositories.users.save(...)` when the repository layer is active, and creates backend notifications with user/organization metadata. A 2026-05-26 local data repair restored the pending request for `baobee100624@gmail.com` after a notification-only approval request.
- `DELETE /api/admin/doctors/:id` finds users by backend id or `firebaseUid`, refuses non-doctor/admin deletes, deletes the linked Firebase Auth account first when configured, then removes backend user/session/membership/notification-device/access links and appends `doctor.delete` audit metadata. Firebase delete failures return an API error so the admin UI cannot falsely report success while the Firebase user remains.
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
  - `src/productionReadiness.js` builds deployment checks for auth mode, Firebase Admin, public HTTPS backend URL, CORS, Postgres, Redis, S3/R2 storage, PHI encryption, SMTP/Gmail, SMS/Zalo webhook, MQTT/TLS, cloud OTA URL, signed firmware warning, Web Admin product build, and Android release build.
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

### Known Android Limits

- Doctor profile clinic/specialty edit is connected to canonical fields, but the profile UX still needs a full visual polish pass.
- Some older Compose screens may still contain mojibake text; fix strings as UTF-8 when touched.
- Live WebSocket sends the Android bearer token when available, but backend listener/device WebSocket auth enforcement still needs a full production pass.
- No FCM token registration pipeline is complete.
- No production scan upload/offline queue.
- No BLE/captive portal provisioning UI for ESP32.

## Firmware: `MSM261S4030H0` and `INMP441`

### Implemented Or Started

- PlatformIO Arduino projects for ESP32-S3.
- `MSM261S4030H0` captures audio and now sends PCM frames to backend over outbound WebSocket/WSS when cloud is configured, with UDP kept as an optional development fallback.
- `INMP441` project has earlier WebSocket/audio experiments.
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

- Chrome DevTools MCP: installed and enabled.
- CodeGraph MCP: installed and enabled.
- Context7 MCP: configured; CLI/skill mode installed and logged in.
- Smart Health project skill: installed at `C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`; this replaces the old project-local `.ai_skills` folder.
- gstack Codex skills: installed under `~\.codex\skills\gstack-*`.
- code-reviewer skill: installed under `~\.agents\skills\code-reviewer`.
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

Result: passed on 2026-06-05 for KLTN evidence and again on 2026-06-06 after Android cloud device status/live audio auth changes. Gradle installed Android SDK Build-Tools 36 and Android SDK Platform 36 during the earlier evidence run.

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleDebug
```

Result: passed. `app-debug.apk` installed and launched on emulator `Pixel_8_Pro_2`; screenshots were captured for login, personal signup, and facility-doctor signup. A short post-launch logcat check did not show `FATAL EXCEPTION`/`AndroidRuntime` lines in the last 500 logcat lines.

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
- `Settings.tsx` was rewritten from mostly `defaultValue`/demo buttons to controlled state loaded/saved through `/api/settings`, with logo upload, SMTP/Gmail test, SMS/Zalo webhook test, and disabled production-only controls with explicit reasons.
- `web-monitor/server.js` now includes `nodemailer`, expanded default settings sections, public runtime settings status, `POST /api/settings/test-email`, `POST /api/settings/test-outbound`, extended `/api/me` profile fields, public session shaping, and admin-preferred demo fallback user selection.
- `src/lib/smart-health-api.ts` now supports the new profile/session/settings/test APIs and preserves raw file `Content-Type` for storage uploads.

### Verification

- Backend: `npm.cmd run check` passed.
- Backend syntax: `node --check server.js` passed.
- Web admin: `npm.cmd run build` passed with existing Vite large-chunk warnings only.
- UI audit: `rg -n 'window\.confirm|alert\('` over admin source returned no matches.
- API smoke on local backend: `/api/me` returned admin demo user, `/api/auth/sessions` returned sessions, `/api/settings` returned runtime SMTP/webhook status, `test-email` returned clear 400 when SMTP env is missing, and `test-outbound` returned clear 400 when webhook config is missing.

### Remaining Limits

- Real Gmail sending still needs env/app-password configuration; no secrets are hardcoded.
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

- Added backend production readiness checks for production auth mode, disabled demo auth, Firebase Admin, public HTTPS backend URL, CORS, Postgres, Redis, S3/R2 object storage, HTTPS storage endpoint, PHI encryption key, rate limit, SMTP/Gmail, SMS/Zalo webhook, MQTT/TLS, cloud OTA public URL, firmware signing/rollback warning, Web Admin product build, and Android release build.
- Added CLI commands `npm.cmd run check:production` and `npm.cmd run check:production:strict`.
- Added platform-only readiness API `GET /api/v1/settings/production-readiness`.
- Added Web Admin Settings tab `Triển khai` to render deployment status and blockers from backend readiness.
- Expanded `web-monitor\.env.example` with production env placeholders for third-party services and secrets.
- Added `D:\Study\KLTN\docs\SMART_HEALTH_THIRD_PARTY_SETUP.md` with setup steps and official documentation links for Firebase, Postgres, R2/S3, SMTP/Gmail, SMS/Zalo webhook, Android release, and ESP provisioning.
- Rewrote `SMART_HEALTH_THIRD_PARTY_SETUP.md` as a detailed Vietnamese step-by-step checklist from Firebase project creation through backend/domain, Postgres, R2/S3, Gmail SMTP, SMS/Zalo webhook, Web Admin, Android release, ESP first flash, cloud OTA, and final readiness checks.
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
- SMTP/Gmail, SMS/Zalo, Redis, MQTT, signed firmware, and Android release signing remain provider/account setup items rather than source-code-only tasks.

## 2026-06-08 GitHub Actions And Next-Day Setup Runbook

### Implemented

- Added root workflow `.github/workflows/smart-health-ci.yml` so GitHub checks backend syntax, workspace access smoke, production readiness report, Web Admin Firebase build, Android debug compile, and ESP32-S3 normal/OTA firmware builds on push, pull request, or manual dispatch.
- Added root workflow `.github/workflows/deploy-web-admin.yml` for manual Firebase Hosting deploy of `https://shcare-admin.web.app` from GitHub Actions. It requires GitHub repository secrets `FIREBASE_SERVICE_ACCOUNT_JSON`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
- Added `smart-health-android/app/google-services.ci.json`, a dummy compile-only Firebase config copied by CI when the real ignored `google-services.json` is absent.
- Added backend script `npm.cmd run smoke:public-deployment` to check the current public Render backend and Firebase Hosting Web Admin without any secrets.
- Updated Web Admin platform-admin chrome so the sidebar footer no longer shows the legacy default workspace `Phòng khám: Smart Health Clinic` or the platform scope subtitle. Platform admins now see a shorter `Quản trị hệ thống` badge in the sidebar; the topbar scope context remains unchanged.
- Added `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md`, a Vietnamese step-by-step runbook for GitHub Actions, Render env, Supabase Postgres/S3, Firebase Hosting, admin account creation, Gmail/SMS/Zalo config, Android build, ESP first flash, and cloud OTA smoke.
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
- SMTP test email now has bounded Nodemailer timeouts, trims Gmail App Password spacing, and converts common Gmail failures into actionable 400 responses instead of a generic backend 500. This covers invalid App Password, missing App Password, sender/from mismatch, and SMTP connection timeout cases.

### Verification

- Backend `npm.cmd run check` passed.
- Web Admin `npm.cmd run build` passed.
- Web Admin `npm.cmd run build:firebase` passed and prerendered `/forgot-password` and `/account`.
- Browser smoke on local `/forgot-password` passed; the page renders proper Vietnamese text and was not submitted to avoid sending a real reset email.
- Source audit passed: no mojibake-pattern hits in `smart-health-admin\thiết kế giao diện\src`, `web-monitor\server.js`, or `web-monitor\src`; remaining `??` matches are valid JavaScript nullish-coalescing operators.

### Remaining Limits

- Real password-reset email delivery still depends on Firebase Console setup: Email/Password provider enabled, password-reset template configured as desired, and `shcare-admin.web.app` authorized.
- Gmail SMTP test email still depends on correct Render env and Gmail setup: `SMTP_USER` should normally match `SMTP_FROM`, and `SMTP_PASS` must be an App Password.
