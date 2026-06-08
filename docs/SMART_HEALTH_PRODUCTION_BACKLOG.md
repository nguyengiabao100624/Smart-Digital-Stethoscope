# Smart Health - Production Backlog

Last updated: 2026-06-08

This backlog is ordered to reduce rework. Keep it updated after implementation so future new chats can start from this plan without re-reading the whole codebase and wasting quota/token.

## Production Direction Already Chosen

- Product direction is remote-first monitoring: connected device deployment, realtime remote audio, stored clinical audio, AI support, sharing, and workspace administration. It is not positioned as an in-room replacement for a traditional stethoscope.
- Canonical product direction is documented in `SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`.
- Device quota means activated/deployed devices in a workspace, not number of patients. One activated device can measure many patient/family profiles.
- Personal/family workspaces need dependent/family patient profiles under one account, with optional sharing to doctors/facilities.
- Clinic/hospital administration is web-first through a Workspace Portal. The existing web admin should evolve into role-aware Platform Admin Console and Workspace Portal modes.
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
- `web-monitor\.env.example` now lists production placeholders for Firebase, public HTTPS backend URL, Postgres, S3/R2, PHI encryption, SMTP/Gmail, SMS/Zalo webhook, MQTT, CORS, and rate limit.
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

## Recently Completed - 2026-06-08 CI/CD And Setup Runbook

- Added root GitHub Actions workflow `Smart Health CI` for backend check, workspace smoke, production readiness report, Web Admin Firebase build, Android debug compile, and ESP32-S3 normal/OTA firmware builds.
- Added manual GitHub Actions workflow `Deploy Web Admin` to build and deploy `shcare-admin` from GitHub once Firebase secrets are configured.
- Added Android `google-services.ci.json` so CI can compile debug without committing the real ignored Firebase Android config.
- Added `npm.cmd run smoke:public-deployment` to verify the current public Render backend and Firebase Hosting Web Admin without secrets.
- Added `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md`, a detailed Vietnamese runbook for the next setup session across GitHub Actions, Render, Supabase, Firebase Hosting, admin account creation, Gmail/SMS/Zalo, Android, ESP first flash, and cloud OTA.
- Rewrote `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` with full Vietnamese accents and more explicit step-by-step instructions so it can be followed directly during the next setup session.
- Refined the platform-admin sidebar so it no longer shows the old default workspace scope text there; the sidebar now uses a shorter `Quản trị hệ thống` badge for platform admins.

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
- Use the global `smart-health-project` Codex skill for project rules. The old project-local `.ai_skills` folder should not be recreated unless there is a strong reason.
- Do not load heavy skills by default. Use `gstack-*`, `code-reviewer`, and other large skills only when the task clearly needs them.
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
- Register Android FCM token in `notification_devices`.
- Add notification delivery fields:
  - channel
  - status
  - sentAt
  - failedAt
  - retryCount
  - errorMessage
- Add user preferences.
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
- Add consent/shared-record expiry.
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
- Add Gmail SMTP test endpoint via Nodemailer and SMS/Zalo webhook test endpoint without committing provider credentials.
- Disable unavailable production-only controls with visible reasons instead of leaving clickable no-op buttons.

Next practical backlog items:

- Configure real Gmail SMTP env with an App Password only on the local/demo machine, then send a real test email from Settings.
- If SMS/Zalo demo is needed, provide a webhook receiver URL and test payload delivery; direct eSMS/Zalo OA paid-provider integration stays later.
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
- Configure Gmail SMTP App Password and optional SMS/Zalo webhook only in local env, then run real outbound delivery tests.
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
- Configure real SMTP and optional SMS/Zalo webhook env only on the deployment/demo machine, then run real outbound tests from Settings.
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
- Hardened Gmail SMTP test email error handling so backend reports invalid App Password, missing App Password, From/Sender mismatch, or SMTP timeout as actionable setup errors instead of a generic backend 500.

Next practical backlog items:

- Push and redeploy Render + Firebase Hosting before re-testing `https://shcare-admin.web.app`; the deployed stack will not change until redeploy.
- In Firebase Console, verify Email/Password sign-in is enabled and `shcare-admin.web.app` is an authorized domain, then test `/forgot-password` with a real admin email.
- In Render, verify Gmail SMTP env uses `SMTP_FROM` from the same Gmail account as `SMTP_USER` unless a Gmail send-as alias is configured; then retest Settings > Test email.
- Browser-smoke Account Settings avatar upload/remove and password change on the deployed site using a real platform-admin account.
