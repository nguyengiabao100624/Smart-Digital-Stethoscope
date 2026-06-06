# Smart Health - New Chat Context

Last updated: 2026-06-06

This is the first file a new Codex chat should read before working on Smart Health. Its purpose is to reduce quota/token usage by summarizing the project state, decisions, paths, tools, and next work so the assistant does not re-scan the entire codebase from scratch.

## Mandatory Context Maintenance Rule

After every meaningful code or configuration change in the Smart Health project, update these project context files before finishing the turn:

- `D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md` when commands, ports, env vars, verification steps, or runbooks change

Update only the sections affected by the change. Keep the files concise, factual, and current. The goal is to make future new chats cheap: read the context docs first, then inspect only the few relevant source files.

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
- `SMART_HEALTH_THIRD_PARTY_SETUP.md`: production setup guide for Firebase, HTTPS backend host, Postgres, S3/R2 storage, Redis, SMTP/Gmail, SMS/Zalo webhook, Android release, and ESP provisioning secrets.
- `SMART_HEALTH_IMPLEMENTATION_STATUS.md`: what is already implemented, what is partial, and what remains demo/scaffold.
- `SMART_HEALTH_PRODUCTION_BACKLOG.md`: ordered production backlog and recommended next milestones.
- `SMART_HEALTH_COMMANDS_GUIDE.md`: local run, build, smoke, Firebase, MCP, and tooling commands.
- `C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`: project-specific Smart Health rules consolidated into the global Codex skills folder.

## Workspace Map

- Root: `D:\Study\KLTN`
- Embedded/backend root: `D:\Study\KLTN\smart-health-embedded`
- Backend monitor/server: `D:\Study\KLTN\smart-health-embedded\web-monitor`
- Firmware MSM261 ESP32-S3: `D:\Study\KLTN\smart-health-embedded\MSM261S4030H0`
- Firmware INMP441 ESP32-S3: `D:\Study\KLTN\smart-health-embedded\INMP441`
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
- Clinic/hospital management is web-first through a Workspace Portal. The existing web admin should evolve into role-aware Platform Admin Console and Workspace Portal modes before creating a separate app.
- Backend `/api/me` should expose workspace context (`memberships`, `currentWorkspaceId`, `currentMembership`, `workspace`) and backend-derived `capabilities`; the web admin now uses those capabilities for sidebar filtering, first-pass route-level access blocking, topbar Platform Admin Console/Workspace Portal labeling, and first-pass action/button/dialog gating on Packages, Clinics, Doctors, Devices, Patients, Storage, Notifications, Doctor Approval, and Admin Actions.
- Patient/profile APIs, device/scan mutation APIs, storage/object download, notification listing, export listing/download, and access-log listing are the first backend routes being tightened for Workspace Portal isolation: platform admin can see global records, workspace roles are scoped to `currentWorkspaceId`, personal/patient users stay limited to their own profiles/workspace, and solo-practice owners get device-management capability for their own workspace. Cross-workspace/forbidden `403` responses now append `access.denied` audit metadata plus warning access logs in backend JSON/demo mode. Continue this same scoping pattern for remaining admin-only storage actions, signed URL edge cases, repository-backed audit parity, and deeper frontend action coverage inside every dialog/form field.
- Backend JSON mode keeps `organizations` as the workspace source of truth with `workspaceType`, `packageId`, `subscriptionStatus`, `billingCycle`, owner, usage, and quota fields.
- Android remains one shared app. Signup currently branches into personal user, solo doctor, and doctor belonging to a health facility. Full workspace switcher/dashboard specialization is still backlog.
- Web admin Packages page is backed by real `/api/admin/packages` data. Workspace/customer management still uses the Clinics route/component name in some files for compatibility.
- 2026-05-26 update: backend `/api/admin/*` no longer assumes only `role=admin`; it uses `requireUser` plus capability checks for Workspace Portal access. Storage upload/share/delete/download, exports/download, packages, workspace CRUD/package assignment, doctor/staff actions, settings/AI updates, data delete, patients/family profiles, scan access, and sharing have stronger backend-side enforcement in JSON/demo mode.
- 2026-05-26 update: a real HTTP smoke script `npm run smoke:workspace-access` logs in six accounts (`admin`, `workspace_admin`, `doctor`, `technician`, `billing`, `viewer`) against a seeded temporary backend and verifies role/cross-workspace behavior, including technician device pairing but no package/storage share permission.
- 2026-05-26 update: Android now has a first family-profile slice: list/create dependent patient profiles, select a profile before starting a scan, and share a profile/scan to a doctor/workspace through `/api/patients/:id/shares`.
- 2026-06-05 update: KLTN report-first evidence was captured in `D:\Study\KLTN\docs\report-evidence\2026-06-05`: firmware PlatformIO build passed, backend `npm run check` passed, backend workspace smoke passed, backend runtime smoke passed (`/api/health`, WebSocket `/app`, UDP test packet), Android `:app:compileDebugKotlin` passed, and web admin `npm run build` passed with only Vite bundle-size warnings. A report-ready Word copy was generated at `D:\Study\KLTN\docs\PL2 (3)-IEEE references.report-ready-20260605.docx` with Chapter 4 technical verification results and Appendix D evidence mapping.
- 2026-06-05 update: KLTN evidence was expanded into `D:\Study\KLTN\docs\PL2 (3)-IEEE references.final-evidence-20260605.docx`. Added web admin screenshots for the main modules, Android emulator screenshots after `:app:assembleDebug` install/launch, audio WAV metadata/waveform evidence, and a final evidence summary. During browser capture, `Overview.tsx` was fixed by adding the missing `Users` import from `lucide-react`; web admin build passed again afterward. Physical ESP32-S3 serial/upload evidence remains pending because `platformio device list` only detected COM3/COM4 Bluetooth links, not COM6/ESP32-S3.
- 2026-06-06 update: cloud-first device control slice was implemented. The Web Admin Devices page now treats backend cloud as the management source, shows heartbeat-derived online/offline state, WiFi/IP/RSSI, firmware/audio/OTA status, device event history, and sends restart/revoke/rotate/OTA commands through backend APIs. Backend added WSS device socket registration, device telemetry/event persistence, `POST /api/v1/devices/:id/commands`, `GET /api/v1/devices/:id/events`, and cloud OTA command creation on `POST /api/v1/devices/:id/ota`. Firmware `MSM261S4030H0` now opens an outbound WebSocket to the backend, sends heartbeat/audio frames/events, receives cloud commands, performs HTTPS firmware download with SHA-256 verification, and falls back to the local AP `SmartHealth-xxxxxx` at `http://192.168.4.1` only for WiFi SSID/password recovery. The old `smarthealth-xxxxxx.local/admin` path is not the product management path.
- 2026-06-06 update: storage-backed cloud OTA release selection is now wired. Backend storage uploads compute SHA-256 and infer firmware version for bucket `device-firmware`; `POST /api/v1/devices/:id/ota` accepts `firmwareFileId`, creates a short-lived tokenized firmware download URL for the ESP, and hides that token from normal device API responses. Web Admin Devices can select an uploaded `.bin` from `device-firmware`, prefill version/checksum, or fall back to a manual URL. Android now parses cloud device fields (`online`, WiFi RSSI/SSID/IP, firmware, OTA/audio status) and uses backend cloud status in device settings, stethoscope settings, patient dashboard, and live audio headers; `LiveAudioClient` also sends the current bearer token on the WebSocket request.
- 2026-06-06 update: production readiness checker was added. Backend now has `npm run check:production`, `npm run check:production:strict`, and platform-only `GET /api/v1/settings/production-readiness`. Web Admin Settings has a `Triển khai` tab that shows required/warning/manual deployment checks. `.env.example` now lists the production third-party envs for Firebase, public HTTPS backend URL, Postgres, S3/R2, PHI encryption, SMTP/Gmail, SMS/Zalo webhook, MQTT, and rate limit. `SMART_HEALTH_THIRD_PARTY_SETUP.md` documents which accounts/secrets the user must create before strict production smoke can pass.

## Installed Local AI Tooling

These tools are installed globally for future Codex chats. New chats should use them only when relevant.

- Chrome DevTools MCP: configured as `chrome-devtools`.
  - Use for local web UI debugging, console/network inspection, screenshots, and performance checks.
- CodeGraph MCP: configured as `codegraph`.
  - Use for structural code questions: definitions, callers, callees, impact, traces.
  - Use `rg` for literal text search and CodeGraph for symbol/flow search.
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
- claude-mem for Codex CLI:
  - Plugin is enabled in Codex config.
  - Worker/viewer runs locally at `http://localhost:37777`.
  - New Smart Health chats should make a best-effort check and start it automatically in the background if it is not running.

## Project Skill Location

The old project-local `D:\Study\KLTN\docs\.ai_skills` folder was consolidated into one global Codex skill:

`C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`

Use that skill for Smart Health-specific architecture, security, UI, firmware, and context-maintenance rules. Other general skills such as `frontend-design`, `code-reviewer`, `gstack-*`, `find-docs`, and Superpowers are already installed globally, so project-local duplicates are no longer needed.

## Product Goal

Smart Health is an Edge AI Smart Digital Stethoscope system:

- ESP32-S3 firmware streams stethoscope audio and device telemetry.
- Android app is used by patients/doctors for registration, verification, live listening, scans, records, notifications, and role-specific dashboards.
- Web admin manages clinics, doctors, patients, devices, audio/AI scans, subscriptions, notifications, audit logs, storage, and production operations.
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

Legacy demo/local flow remains available for development fallback:

- ESP32 MSM261S4030H0 sends PCM audio over UDP to backend port `3001`.
- Backend ingests UDP, keeps scan state, writes local WAV files, and fans audio/metrics out over WebSocket.
- Android listens to backend WebSocket `/app` for live audio and metrics.
- Web admin talks to backend REST APIs and Firebase Auth.

Important limitation: the local UDP demo path is useful for KLTN and iteration, but it is not production-secure yet. Cloud WSS/OTA now exists as the intended product path and storage-backed firmware selection is wired, but physical-board end-to-end smoke, TLS certificate hardening, signed firmware, rollback, and production provisioning still need completion before calling the device lifecycle fully production-ready.

Production-readiness gate now exists:

- Backend CLI: `npm run check:production` reports current deployment gaps without failing; `npm run check:production:strict` fails when required items are missing.
- Web Admin: platform admins can open Settings > `Triển khai` to see the same checklist.
- Current local/demo env is expected to be `BLOCKED` until the user supplies real third-party setup: Firebase Admin credentials, HTTPS API domain, Postgres URL, S3/R2 credentials, PHI key, and optional SMTP/SMS/Zalo/MQTT details.

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
npm run build
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
- Added Gmail/SMTP and SMS/Zalo webhook support in backend settings. Email test uses `nodemailer` and env `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. SMS/Zalo test posts webhook payload `{ channel, to, message, templateId?, metadata? }` using `OUTBOUND_WEBHOOK_URL` or settings webhook URL; optional secret is `OUTBOUND_WEBHOOK_SECRET`.
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
