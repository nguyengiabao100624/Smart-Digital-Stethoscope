# Smart Health KLTN Test Matrix And Gap Log

Last updated: 2026-07-23

This matrix is scoped to the KLTN/thesis gate. Production expansion items stay future work unless fresh verification closes them.

## Gap Matrix

| Group | Finding | Status after this pass |
| --- | --- | --- |
| Existing bug | Shcare Portal account profile save could show success but revert after reopening because persistence was not proven against repository/Postgres. | Source fixed in earlier 2026-07-10 slice; production proof still depends on live backend availability. Keep rerun requirement in handoff. |
| Existing bug risk | Console can show mojibake for Vietnamese when PowerShell reads UTF-8 files with the wrong code page. | Do not bulk-rewrite source strings from terminal output alone. Verify file encoding/rendered UI before editing copy. |
| Existing module incomplete | Firmware/backend/Android audio contract existed in source but was scattered across firmware constants, backend WebSocket/UDP code, Android `LiveAudioClient`, and old evidence docs. | Closed for documentation/source-contract traceability by `docs/khoaluan` plus `smoke:klt-contract`. |
| Existing module incomplete | KLTN report had evidence plan but lacked a single contract pack for common entities, status mapping, audio packet format, demo evidence, and gap matrix. | Closed by this folder. |
| Existing module partial | Redis/BullMQ audio worker source path exists, but live queue runtime proof needs `REDIS_URL` and backend/worker against the same data/storage env. | Still partial; not needed to claim basic KLTN demo. |
| Existing module partial | PostgreSQL/Supabase is production direction and many repositories exist, but not every runtime handler should be claimed Postgres-only without current proof. | Partial; report must separate JSON demo fallback from production direction. |
| Existing module partial | Real Android runtime screenshots/device proof are blocked when `adb devices` has no usable attached device/emulator. | Blocked by device/emulator availability. Source/build checks remain valid. |
| Existing module partial | Physical ESP32-S3/MSM261S4030H0 validation requires connected serial board and same-run audio evidence. | Blocked until board appears in `platformio device list`. |
| Important missing thesis artifact | A repeatable KLTN evidence command/checklist was not linked from the main docs. | Added `03-demo-and-evidence-checklist.md` and backend `smoke:klt-contract`. |

## Module End-To-End Matrix

| Module | UI/UX | API/backend | Data/persistence | Permission | Validation/error handling | Smoke/evidence | KLTN status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth/account/profile | Native Android and Web/Admin account surfaces; Web and Android source/build gates refreshed | Backend `/me`, auth/session/2FA plus managed-admin activation saga | Firebase + backend repository; additive identity migrations; Android pending registration encrypted with Keystore AES-GCM | Active approved membership, cross-instance revocation, last-admin and provider/backend guards | Profile validation, explicit offline/403 states, idempotent server-confirmed session revoke, ambiguous-COMMIT recovery | Web 31/31 Auth + 14/14 contract; Android 108/108 + assemble/lint; backend check/base/managed-admin/import/repository/workspace/2FA/Firebase/KLT smokes | Source/local closed; live PostgreSQL/Firebase and Android runtime BLOCKED |
| Patient/family profiles | Android native profile/data-access and Web Portal patient/consent flows | Patient CRUD plus versioned consent/share authority routes | JSON + PostgreSQL repository; additive migration 036 | Owner/account/guardian, operational workspace and approved doctor checks | Cross-workspace, suspended membership, idempotency and malformed-outcome denials | Backend workspace/repository/identity smokes; Web 32/32; Android 174/174 | Source/local closed; live DB/browser/emulator BLOCKED |
| Patient CSV import | Portal-native three-step desktop workflow; Android intentionally N/A | Tenant-scoped validate/detail/commit with 24-hour expiry | JSON + PostgreSQL repository; additive migration 042 and JSON reconciliation | Workspace/platform patient-manage capability; personal/viewer/cross-tenant denied | UTF-8, 5 MiB, 5,000 rows, structured validation, duplicates, atomic rollback and exact replay | Import 8/8; workspace/identity gates; Web 57/57 + 97/97; browser 18/18 with mutation cleanup | Source/local/browser closed; candidate PostgreSQL and live deploy BLOCKED |
| Device management | Portal/admin/device screens; Android settings | `/api/devices`, commands, events, OTA | JSON + repository direction | Target-workspace active membership; Platform Admin exception | Claim/revoke/rotate/assign plus suspended paired-user/owner negatives | Workspace/admin smokes; ownership repository 32 tests; firmware build | Partial until physical board proof |
| Live audio and scan | Android live monitor, web/admin record views | UDP/WSS ingest, `/app` listener, scan start/stop/chunk APIs | WAV/audio/AI metadata | Patient/device/scan access checks | Odd/empty PCM ignored; interrupted scans marked honestly | `smoke:klt-contract`; old runtime smoke; physical proof pending | Implemented source/demo, physical proof pending |
| AI quality support | AI measurements/admin, Android support surfaces | Signal-quality processing and worker path | AI result rows/artifacts | Workspace/patient scope | Queue fallback vs Redis path documented | Backend tests/checks; live Redis pending | Advisory support only |
| Appointments/consultations | Portal appointments route | Appointment APIs | Migration/repository exists | Workspace/doctor/patient scope | Status transitions and cross-workspace denial | Portal/browser/mutation/backend smokes | Implemented demo/live earlier |
| Notifications | Separate Android list/settings/deep-link UX; Web list; Admin campaign operations | Audience options plus idempotent workspace/role/user campaign and FCM/email paths | Migration 041, recipient rows, audit/replay ledger and per-channel states | Active membership, capability and cross-workspace denial | Exact receipt validation; provider disabled/unavailable/failed remains distinct from accepted/sent | Campaign repository 5/5, workspace/push smokes, Admin browser 36/36 with mutation cleanup, Android 176/176 | Source/local closed; live PostgreSQL, provider and Android runtime BLOCKED |
| Admin/Portal Overview | Independent dense Admin/Portal dashboard; Android actor-specific dashboards are N/A | Range-scoped overview aliases with `today|7d|30d` and timezone offset | Existing tenant-scoped records; no migration | Dashboard capability plus platform/workspace scoping | Invalid range 400; strict totals/keys; first-load error cannot become fake zeros | Overview 4/4, workspace smoke, Admin 135/135, browser 45/45, builds | Source/local closed; live deploy/read compatibility pending |
| Storage/audio artifacts | Admin/portal storage and scan audio views; Platform Storage is Android N/A | Storage upload/download/share/audio routes | Local object storage + S3 direction | Workspace/scan/object scoping | Strict stats/files parsing; independent partial/stale/retry; 404/denial/delete handling | Storage 13/13, Admin 138/138, browser 54/54, storage/workspace smokes | Source/local closed; live provider proof pending |
| Audit ledger and export | Independent Portal/Admin audit and export UX; Android workspace/platform audit UI is N/A | Canonical server-filtered/paged audit API plus versioned JSON/CSV/XLSX/PDF artifact create/list/download | Append-only JSON/PostgreSQL audit ledger; additive migration 043 stores scope, filters, renderer and SHA-256 | Dedicated audit/export capabilities; platform global audit, workspace owner/admin, doctor granted patients, patient own/dependent; billing/viewer denied | Write-time secret redaction, date/query validation, exact idempotency, creator/job/tenant isolation and audited download/cleanup | Backend 12/12 + integrated/OpenAPI 0.4.0; Admin 151/151/browser 72/72; Portal focused 8/8, full 105, contracts 60/60 + targeted CSV/cleanup | Source/build/targeted-browser closed; full Portal route smoke and live migration/promotion proof open |
| KLTN docs/evidence | Report docs and this contract pack | Smoke/runbook links | Evidence folder convention | Honest claim levels | Blocker rules | `smoke:klt-contract`, build/smoke commands | Implemented for thesis traceability |

## Current Blockers To State In The Report

- No clinical validation or certified medical-device claim.
- No diagnostic accuracy claim for AI/chatbot without a validated dataset.
- UDP fallback is not production-secure.
- Physical ESP32-S3/MSM261S4030H0 proof requires a detected serial device and fresh same-run logs/audio.
- Android runtime visual proof requires a stable emulator or physical device.
- Real FCM, inbox click-through, Redis worker, MQTT, and provider object-storage proof require external envs/devices/providers.
- Notification campaign source/build proof does not replace live migration 041, Brevo/FCM acceptance, Android display/deep-link or user-view evidence.
- Phase 3 frozen-snapshot negative tests closed the known source/local identity P0/P1 findings. The report must still label real PostgreSQL migration/row-lock, Firebase provider mutation, Android runtime and production deployment evidence as `BLOCKED` until fresh external proof exists.

## Minimum Definition Of Done For KLTN Demo Closure

Before saying the KLTN demo evidence is complete, capture:

1. Backend `smoke:klt-contract`, `check`, and workspace smoke logs.
2. Firmware PlatformIO build log for `MSM261S4030H0`.
3. Either real ESP32-S3 serial/audio logs or a clearly labeled hardware blocker plus separate simulated backend audio proof.
4. Android build log and authenticated runtime screenshots if a device/emulator is available.
5. Shcare Portal and Web Admin build/smoke evidence for the routes used in the report.
6. One saved scan/audio artifact or a clearly labeled simulated WAV artifact.
7. A limitations section matching the blockers above.

## 2026-07-17 Phase 4 Device Provision/Inventory Evidence

- Backend device-security smoke passed 31/31. It covers provision idempotency/replay without raw claim-code persistence, audit rollback, SQL nullable purchase dates, inventory metadata migration/reconciliation, WSS authentication, command/OTA lifecycle and audio-source isolation.
- Admin source contracts passed 28/28; TypeScript, ESLint and production client/SSR build passed. Add Device now uses the same idempotency contract as the backend and blocks dismissal during a pending mutation.
- Firmware source review, six shared fixtures and three PlatformIO ESP32-S3 builds passed. Native test execution is `BLOCKED` because this host has no `gcc/g++`; no physical board/serial/I2S/WSS/OTA rollback evidence exists.
- Keep the following gaps explicit in the report: real PostgreSQL migration/row-lock, provider mutation, authenticated browser mutation, Android runtime, secure setup AP PoP/CSRF/expiry, two-phase secret rotation, SQL-authoritative claim lifecycle and complete firmware telemetry/ACK/durable command dedupe.

## 2026-07-17 Phase 4 secure setup and telemetry evidence

- Setup AP source checks now cover the factory-state/physical-gesture gate, random CSRF token with constant-time validation, restrictive response headers, ten-minute expiry and factory-reset handling. Per-device PoP/WPA2 is still `BLOCKED` because the current QR/App/firmware contract has no safe credential exchange.
- Telemetry is allowlisted at the backend boundary and persisted through migration 026. Firmware, Web, Admin and Android share the optional telemetry schema; unknown and secret-shaped fields are discarded.
- Local verification passed: backend device-security 33/33, Web lint/build, Admin contracts 28/28 plus typecheck/lint/build, Android compile/unit tests, and firmware production/development/OTA builds plus embedded test-target compile.
- Runtime evidence remains separate and open: native firmware test execution (missing `gcc/g++`), real PostgreSQL/provider/browser mutation, Android device/emulator, serial/I2S/WSS and OTA rollback.

## 2026-07-18 Phase 4 final source/local evidence

- Backend device-security passed 38/38, ownership repository 30/30, setup security 3/3 and concurrency 2/2. Check/base/repository/workspace/identity-migration/KLT contract gates also passed. The acknowledged/applying race is covered by a deterministic per-device event-serialization regression.
- Web pairing passed 9/9 focused and 52/52 full Auth tests plus lint/build. Admin passed 46/46 contracts, TypeScript, lint and client/SSR build; provision, Activate and OTA no longer emit success before the correct backend/device confirmation.
- Android pairing uses a typed, fail-closed backend response while retaining an independent native UI. Focused tests passed 21/21 and the full suite passed 140/140; compile, debug assemble and lint passed. APK SHA-256 is `584946A4BC26F3432668D69F903A004AD3926163A57CE28C3A0E8695F0CFE58F`.
- Firmware production/development/OTA-build profiles passed. Production used 52,416 bytes RAM and 1,083,777 bytes flash and has SHA-256 `27EE44D3CC1C827318EE22C9565302848A3BB078DE7DA86EA25D440235DB6E80`. The production image was rebuilt after the compile-only embedded test because that test target overwrites the same environment output.
- This evidence closes the Phase 4 source/local implementation gaps recorded on 2026-07-17, including per-device WPA2 PoP, rotation invariants, SQL/JSON ownership parity and command event ordering. It does not close live PostgreSQL/provider/browser, Android runtime, native C++, serial/I2S/WSS, actual flash-size or OTA rollback proof.
- The report must also retain the Admin dependency gate: zero critical advisories after the `websocket-driver@0.7.5` override, but seven high advisories remain and `xlsx` currently has no upstream fix. No production promotion is claimed.
- Phase 5 begins with audited P0s: cross-workspace PHI cache scope, Live metrics/status/frame identity and removal of fake or false-completed Admin AI data. These must be resolved before claiming the clinical scan/review flow complete.
- The backend/firmware audit did not find a current cross-device v2 source-binding bypass, but the global recording singleton, missing persisted audio-command ACK lifecycle, disconnect cleanup, duplicate-prone processing and non-idempotent chunk append remain P1 blockers. No scan/live/review completion claim is allowed until those state transitions and concurrency negatives are covered.

## 2026-07-18 Phase 5 scan/audio/review/alert source-local evidence

- The Phase 5 P0/P1 source findings are closed: workspace-scoped PHI caches, source-bound live/scan identity, real review/alert ledgers, truthful Admin/Android AI states, idempotent chunk upload, reclaimable completion, durable processing identity, atomic worker persistence, tenant composite scope, bounded uploads, orphan cleanup and generation-safe terminal failure.
- Backend evidence passed: check/test; upload 15/15; worker 6/6; clinical workflow 8/8; device security 41/41; audio protocol 4/4; AI 5/5; API production, workspace, repository, identity migration, KLT contract, concurrency 2/2 and setup security 3/3 smokes.
- Web evidence passed 24/24 contracts and 84/84 Auth tests plus lint/type/Firebase build and Chromium desktop/mobile checks. Admin passed 59/59 contracts plus lint/type/client+SSR build. Android passed 158/158 unit tests across 26 suites plus assemble, lint and debug-instrumentation compile; APK SHA-256 is `E19F5D525AECB53295D56DCC99B62352D214A102A431AC41A5273E3BD0D4180B`.
- This is source/build/local/simulated evidence only. Real PostgreSQL migration/locking, Redis/BullMQ, provider delivery/authenticated production mutation, Android emulator/device/TalkBack/FCM, and physical ESP32-S3 serial/I2S/WSS/OTA rollback remain `BLOCKED`. No deployment or clinical-validation claim is attached to this closure.
- The KLTN report may describe deterministic retry/tenant/concurrency behavior proven by local tests, but must label device audio, live provider and physical timing evidence separately. Phase 6–7 functional work is the next source track; external Phase 4B/5 proof stays open.

## 2026-07-18 Phase 6–7 consent/settings/membership source-local evidence

- Backend access authority is explicit and auditable: patient consent, clinician grant and administrative assignment have separate actors, purpose, recipient, scope, expiry and revoke lifecycle. Migration 036 is additive; no live database execution is claimed.
- Suspended membership negatives cover account switch, patient mutation/share, notification audience, owner invariants/transfer, appointment, direct scan/audio grants, paired-device reads and JSON/SQL device ownership. Reactivation restores only the intended workspace rights.
- Web Portal consent passed 32/32 contracts plus type/lint/build. Android native consent/data access passed 14/14 focused and 174/174 full unit tests plus compile/lint/assemble; APK SHA-256 is `240D7AB72415BDCDA7C1CB33636A711B79E3BC0B0FA465989FBD6AA670952E6F`.
- Platform Admin Settings passed 73/73 contracts plus type/lint/build after fake/local-only backup, API-key, policy and device-default success controls were removed or marked unavailable.
- Integrated backend gates passed check/base/repository/identity/workspace/device-ownership/KLT. Live PostgreSQL, authenticated browser mutation, provider delivery, Android runtime/TalkBack/FCM and physical board/device proof remain `BLOCKED`; firmware impact for consent/settings is `N/A`.

## 2026-07-19 Phase 6–7 packages/storage source-local evidence

- Package lifecycle is backed by migration 037 plus JSON/PostgreSQL repositories with Platform Admin authority, required idempotency, exact replay, transaction-bound audit and assigned-package archive protection.
- Storage bucket/file metadata is backed by migration 038. Upload persistence failure compensates the provider object; delete is soft and exact replay cannot delete twice; tenant and capability negatives are covered in workspace smoke.
- Admin Storage reports actual backend facts and removes unsupported quota, encryption, public-access, fake timeline and fake progress claims. Signed sharing is available only through an HTTPS S3 provider URL; local provider status is explicitly unavailable.
- Evidence passed: backend package 3/3, storage 6/6, check/base/repository/identity/workspace/KLT; Admin 91/91 plus TypeScript, ESLint and client/SSR build; OpenAPI parsed at version 0.3.0 with 45 paths.
- Live PostgreSQL migrations 037/038, S3 provider call, authenticated browser mutation and production deployment remain `BLOCKED`. Android and firmware impact is `N/A` for these Platform Admin-only operations.

## 2026-07-19 Phase 6–7 staff invitation source-local evidence

- Migration 039 plus JSON/PostgreSQL repositories implement invitation list/create/resend/revoke/accept with workspace scope, six roles, idempotency, transaction audit and SHA-256 token-hash storage. Exact replay does not return the one-time secret; provider delivery is recorded separately.
- Admin Doctors and Portal Staff use independent web layouts over the same lifecycle. Auth acceptance is a separate Auth-shell route with identity-only login, 2FA, signup/email verification and read-after-write membership authority validation.
- Evidence passed: backend staff 7/7 plus check/base/workspace/repository/identity/KLT/OpenAPI; Admin 12/12 focused and 103/103 full plus type/lint/build; Web 43/43 contracts and 91/91 Auth plus type/lint/build; Chromium 390/768/1440 light/dark/system/reduced-motion matrix 9/9 with zero serious/critical axe/runtime/layout findings.
- Live PostgreSQL migration, provider email/inbox, authenticated production mutation and deploy remain `BLOCKED`. Android only consumes membership/workspace state through its native UI and firmware impact is `N/A`.

## 2026-07-23 Phase 6–7 Clinics/Workspace and theme source-local evidence

- Migration 040 plus JSON/PostgreSQL repositories establish one versioned, idempotent and audited workspace lifecycle. Explicit archive tombstones survive restart and block catalog/role-request resurrection; owner approval and transfer share the same state machine.
- Backend evidence passed workspace lifecycle 7/7, check/test, workspace access, repositories, identity migration and KLT contract. OpenAPI 3.0.3 parsed with 53 paths and 38 schemas; the bundled JSON tenant-remediation result remains truthfully `BLOCKED`.
- Platform Admin evidence passed 122/122 contracts, TypeScript, ESLint, client/SSR build and Firebase build with 17 prerendered routes. The self-starting authenticated Clinics browser matrix passed 27/27 at 390/768/1440 and light/dark/system with zero serious/critical axe, console/request, overflow, theme or 44 px target failures.
- Web evidence passed 44/44 contracts, 94/94 Auth, TypeScript, ESLint, client/SSR and Firebase builds. The 15-route Auth matrix passed 135/135 checks across three viewports and three theme preferences with zero blocking accessibility/runtime/asset/layout findings.
- This evidence is source/build/local only. Live PostgreSQL migration/locking/rollback, Firebase/provider state, preview/live mutation cleanup, deployment, Android runtime and hardware proof remain separate. Android does not require Platform approval UI; firmware impact is `N/A`.

## 2026-07-23 Phase 6–7C notification campaign source-local evidence

- Migration 041 and JSON/PostgreSQL repositories persist recipient-scoped campaign/audience/channel state with transaction audit and idempotent replay. Workspace, role and explicit-user audiences are tenant/capability checked; non-role audiences no longer inherit a default role.
- Admin Notifications uses a separate management UI with provider availability and exact receipt validation. The 36/36 browser matrix created a real local in-app campaign, cleaned the temporary database and found zero blocking axe/runtime/request/layout/provider-state issues after touch-target and contrast fixes.
- Evidence passed: backend campaign 5/5 plus check/base/workspace/push/repository/identity/KLT; OpenAPI 54 paths/48 schemas; Admin 128/128 plus type/lint/builds; Web 94/94 Auth and 44/44 contracts plus lint/builds; Android 176/176 plus Kotlin compile and debug assemble.
- Live PostgreSQL migration 041, Brevo/FCM delivery, Android notification runtime/deep-link and preview/live deploy remain `BLOCKED`. Firmware has no campaign actor and is `N/A` for this slice.

## 2026-07-23 Phase 6–7D1 Overview source-local evidence

- Backend Overview replaces the fixed 10/30/40/20 distribution with real scan timestamp aggregation for `today|7d|30d`, interpreted through an explicit integer timezone offset. Range metadata and stable lifecycle keys are part of the response; invalid filters fail closed.
- Admin strict-validates totals and lifecycle slices before rendering. Fake zero fallback, hardcoded trends, progress floor, synthetic alert timeline and light-only chart styling were removed; loading/empty/error/retry/stale states remain distinguishable.
- Evidence passed: overview 4/4, backend check/base/workspace/repository; OpenAPI 56 paths/53 schemas; Admin 135/135, TypeScript, ESLint, client/SSR and Firebase builds; authenticated browser matrix 45/45 with zero blocking axe/runtime/request/overflow/theme/44 px findings.
- This is source/build/local evidence only. Live backend/Admin/Portal deployment and compatibility reads remain open. Android keeps separate patient/doctor native dashboards and is `N/A`; firmware is `N/A` because no device protocol changed.

## 2026-07-23 Phase 6–7D2A Storage partial-state evidence

- The audit distinguished a dormant fallback from the reproduced defect: the existing first-load guard hid the default-zero object on ordinary total failure, but coupled `Promise.all` still discarded partial success and refresh failure hid confirmed data.
- Stats/files now settle independently and pass strict parsers. Partial and stale states are explicit, missing sections receive no substitute facts, upload requires a confirmed bucket catalog, and Devices reuses the private-file parser for firmware inventory.
- Evidence passed: focused Storage 13/13, full Admin 138/138, TypeScript, ESLint, client/SSR and Firebase builds; authenticated browser 54/54 across three viewports and three theme preferences with zero blocking axe/runtime/request/overflow/theme/44 px findings.
- No schema/device contract changed. Live S3/provider, authenticated preview/live mutation and deployment proof remain open; Android and firmware are `N/A`.

## 2026-07-23 Phase 6–7D2B Patient CRUD source-local evidence

- Canonical patient resource IDs are distinct from patient codes. Backend/Admin/Portal strict parsers and exact mutation receipts cover structured DOB, gender, contact, blood type, allergies, emergency contact and profile relationship without notes packing.
- Create/update/delete are tenant/capability scoped, audited and retry-idempotent. JSON writes are serialized with snapshot rollback; keyed delete replay is valid after soft deletion while old unkeyed clients remain compatible.
- Evidence passed: backend check/base/repositories/workspace/KLT; Admin `146/146`, TypeScript, ESLint, client/SSR and Firebase builds; Web `53/53` contracts, `96/96` Auth/UI tests, TypeScript, ESLint and both builds; Android family-profile tests and full debug unit/build gate.
- Authenticated local browser evidence passed Admin `63` route/viewport/theme checks plus real CRUD/cleanup and Portal Patients `9` viewport/theme checks plus canonical receipt/replay/cleanup. No serious/critical axe, console/request, overflow, theme or undersized-target finding remained.
- This is not live or device proof. Android keeps native Family Profiles UI; emulator/device evidence remains open and firmware is `N/A`. Patient CSV Import remains a separate open gap until the backend batch lifecycle is implemented and tested.

## 2026-07-23 Phase 6–7D2C Patient CSV Import source-local evidence

- Additive migration 042 plus JSON/PostgreSQL repositories implement a tenant-scoped 24-hour validation batch. UTF-8 CSV is bounded at 5 MiB/5,000 rows; validation reports structured field/duplicate errors without creating patients, and commit performs a final duplicate check before one atomic patient/audit/idempotency outcome.
- Portal has an independent responsive select/preview/confirm workflow with 50-row paging and complete loading/error/retry/offline/stale/permission/invalid/expired/unsaved/destructive/committed states. Success appears only after the exact backend commit receipt.
- Evidence passed: import contract/repository 8/8, backend check/base/repositories/workspace/identity/KLT, OpenAPI 59 paths/59 schemas, Web 57/57 contracts and 97/97 Auth/UI plus type/lint/builds, and browser 18/18 plus real validate/commit/replay/cleanup with zero blocking findings.
- This is not live database or deployment proof. Candidate PostgreSQL migration/locking/rollback and preview/live cleanup remain open. Android and firmware are `N/A` for this bulk desktop operation.

## 2026-07-23 Phase 6–7D2D Audit/Export source-local evidence

- `/api/v1/audit-logs` is the canonical append-only ledger. `/api/v1/access-logs` and `/api/v1/portal/audit-log` are compatibility aliases over the same tenant-scoped server query, filter, sort and pagination contract; legacy access-history rows are no longer presented as the audit source of truth.
- Audit metadata is recursively redacted before persistence. PostgreSQL keeps append-only enforcement and the JSON fallback exposes append-only event creation, so clients do not depend on display-time masking or editable audit rows.
- Migration 043 and renderer `shcare.export-artifact.v1` preserve dataset, scope, filters, artifact SHA-256 and immutable snapshot identity. Backend downloads are real JSON, UTF-8 CSV, OpenXML XLSX or PDF artifacts rather than client-generated labels over JSON data.
- Export authority is explicit: Platform Admin may export a platform-global audit ledger; workspace owner/admin is workspace-scoped; doctor clinical export is limited to active patient grants; patient clinical export is limited to owned/dependent profiles; billing and viewer are denied. Limited actors see only their own jobs, and all cross-tenant/global download negatives fail closed.
- Create is idempotent and transaction-audited; exact replay does not create another audit event. Successful download is audited separately, and the workspace smoke revokes the temporary doctor grant used for scope proof. Bundled JSON tenant and dangling-owner corrections have explicit audit events and the identity-migration gate now passes, superseding the older bundled-dataset blocker.
- Verified backend evidence: `check:audit-export`, focused audit/export `12/12`, `smoke:repositories`, `smoke:identity-migrations`, `smoke:workspace-access`, `npm.cmd test`, `smoke:klt-contract` and OpenAPI `0.4.0`. No live migration 043, authenticated preview/live artifact download or deployment is claimed.
- Platform Admin passed TypeScript, ESLint, `151/151` contracts, build and browser `72/72` across 390/768/1440 plus light/dark/system. The browser found zero serious/critical axe, console/request, overflow/theme or sub-44 px failure and verified a real platform CSV Blob using SHA-256, `Content-Disposition`, UTF-8 BOM and cleanup. The old `xlsx` advisories are gone; 17 other advisories remain with 0 critical.
- Portal passed focused audit/export `8/8`, full Vitest `29` files/`105` tests, contracts `60/60`, TypeScript, ESLint, targeted diff check and Firebase build (`2391` modules; CSS `62.64 KB` gzip). Targeted browser proof filtered 147 audit events to 11 server matches, downloaded an 11-row CSV with SHA prefix `4e031d2e6faa`, then observed 149 events including export create/download; Reports rendered real 1-patient/2-device/2-scan/0-abnormal facts. Scope/workspace/renderer/hash mismatches fail closed and cleanup removed the local backend, ports, data and credential.
- The complete Portal route smoke remains open: after obsolete harness selectors were fixed, the third attempt ended on dev-server timeout/`ERR_CONNECTION_REFUSED` before a product assertion. This is neither a green full-route result nor evidence of a product regression. Portal `bun audit` retains 5 advisories (1 high, 3 moderate, 1 low).
- Android does not receive the workspace/platform audit-management UI. Personal export/access-history remains a separate native Settings/Security slice. Firmware impact is `N/A`.

## 2026-07-23 Phase 8B/8C candidate evidence

- Complete Portal route proof now passes on isolated local services. The run
  covers capability-derived navigation and direct denial plus the principal
  clinical/account routes with no accumulated HTTP, request or severe console
  failure. This supersedes the earlier local-server timeout entry.
- Regression gates: Web `105/105` Auth/UI, `63/63` contracts, type/lint/Firebase
  build; backend check/base smoke; Admin contracts/build; Android `176/176`,
  assemble/lint; brand `5/5`; shared schemas `11/11`; firmware production,
  development and OTA-profile builds.
- Portal dependency remediation leaves `bun audit` with no findings and all
  Portal gates green after the lockfile update. Admin production-only audit is
  `1 low`, `0 high`, `0 critical`; the remaining item applies to a Windows
  development-server path and is not treated as runtime production closure.
- Android debug APK and firmware hashes are frozen in
  `../SMART_HEALTH_RELEASE_CANDIDATE_MANIFEST.md`. Debug APK signing is not
  production signing, OTA-profile compilation is not an OTA upload, and no
  emulator/device/board proof is inferred from these builds.
- Candidate PostgreSQL migrations, provider preview/live journeys, Android
  runtime and ESP32-S3 hardware validation remain open evidence rows.
