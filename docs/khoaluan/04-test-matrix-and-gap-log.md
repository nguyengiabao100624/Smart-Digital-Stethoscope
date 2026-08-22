# Smart Health KLTN Test Matrix And Gap Log

Last updated: 2026-08-15

This matrix is scoped to the KLTN/thesis gate. Production expansion items stay future work unless fresh verification closes them.

## 2026-08-15 current phase evidence

| Surface | Source/build/local proof | External proof | Disposition |
| --- | --- | --- | --- |
| Phase 3 Identity/Profile/Security | Web Avatar `62/62`, Auth `396/396`, contracts `121/121`; backend Avatar `22/22` + API, 2FA `35/35`; aggregate gates and independent P0/P1 review pass | Firebase/provider/live PostgreSQL and physical Android runtime unavailable | Phase 3 complete at available proof; external gates stay `BLOCKED` |
| Phase 4 Device provisioning/command | Shared `44/44`; backend check + device-security `42/42`; Web `122/122` + claim `10/10` + route subset `8/8`; Admin `183/183`; Android `108` suites / `781` tests + devices `48/48` + compile/lint/assemble; firmware source-contract, MCU compile-only and normal/OTA builds pass | Cross-surface review reopened five P1 software blockers; physical board, serial, I2S, WSS, rollback and 16 MB HIL unavailable | Phase 4 in progress; software blockers active, hardware-only proof `DEFERRED — chờ phần cứng` |

The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal,
Platform Admin, Android và firmware”**. Build proof must not be reported as live
provider/device proof.

### Phase 4 non-final candidate detail

- Android debug APK SHA-256 is
  `F32C7C3A85E40A217ACC8AEEC2DDF6DD0DA6694FA69B53BC4AF94263DD6828FE`.
- Firmware normal and OTA images are each `1,104,640` bytes. SHA-256 values are
  `CB2B0A8749697FEEB14F4720E64A0CF8629109CDF6377784B7DB7F6CB2BAA7B5` and
  `CA79DE814DAC8D6BB3A48EB87F80E6ADDF331C62009129C013C250F30A074801`.
  Earlier firmware hashes are superseded pre-remediation artifacts. Independent
  re-review found no remaining software blocker in the four-item firmware scope.
- Native C++ execution is unavailable because the host has no `gcc`, `g++`,
  `clang` or `cl`; MCU test proof is compile-only with `0` tests executed.
- The five active P1 software blockers are: generic Admin command must exclude
  specialized revoke/rotate/OTA/audio lifecycle types; SQL pair must share the
  ownership lock/current row; pair contract + Portal + Android must require exact
  active workspace and verify receipt/poll authority; Admin revoke must keep a
  stable `Idempotency-Key`; shared/OpenAPI must define command/revoke/rotate/OTA
  contracts. No Phase 4 closure is claimed before remediation and re-review.

## Gap Matrix

| Group | Finding | Status after this pass |
| --- | --- | --- |
| Phase 2 UI foundation | Four active Web CSS files previously carried 1,824 legacy `!important` declarations and Public bundle/performance budgets were incomplete. | Closed source/local: `0` `!important`, CSS gate `7/7`, Public initial graph `228,654 bytes gzip`, local LCP `276 ms`, INP `64 ms`, CLS `0.00034024`, and Chromium/Firefox/WebKit UI matrices pass. |
| Phase 2 Android foundation | Inline copy, SignUp abandonment, route authority, deprecation and lint debt prevented a clean mobile foundation checkpoint. | Closed source/build: `682/682`, Kotlin warning `0`, lint `0/0`, AndroidTest compile and APK assemble pass. Provider/emulator proof remains blocked. |
| Phase 3 Identity/Profile/Security | Forgot Password, Family receipt/retry, Workspace Settings transaction, 2FA response-loss, Avatar cleanup/authority, inactive-account ordering, stable retry and OpenAPI parity were audited across the active surfaces. | Closed at source/build/local: final Web/backend/shared/Android gates and independent P0/P1 exit review pass. Provider/live/emulator proof remains a separate `BLOCKED` class. |
| Phase 4 Device provisioning/command | Candidate source/build gates are green, but authority/idempotency/contract exit review is not green. | In progress: remediate the five P1 items listed above, rerun affected gates and independent review; physical HIL remains separate `DEFERRED — chờ phần cứng`. |
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
| Device management | Portal state/claim/assign, Admin fleet controls, native Android pairing/status | `/api/devices`, pair, command, revoke, rotate, OTA and WSS presence | JSON + PostgreSQL repository direction | Exact active workspace membership; Platform Admin-only fleet controls | Exact idempotency/receipt/poll authority, specialized-command exclusion, ownership lock and cross-workspace negatives | Shared `44/44`; backend `42/42`; Web `122/122` + `10/10` + `8/8`; Admin `183/183`; Android `781` + devices `48/48`; firmware contract/compile/build | Phase 4 in progress: five P1 software blockers active; physical HIL deferred |
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

## 2026-07-23 Phase 8C clean source candidate evidence

- Source revision
  `3beac9604f2a2381697e58a5278502b6f7c5ca0e` passed a detached release audit:
  `512` baseline-diff files, `0` outside the canonical allowlist, `0`
  credential paths/high-confidence credential findings and a clean
  `git diff --check`.
- Backend at the exact source revision passed clean install with `0`
  vulnerabilities, syntax check, base smoke and KLT contract. Admin at the
  exact source revision passed `151/151`, type, lint and client/SSR build.
  Web code is byte-identical to its green frozen clean run (`105/105`,
  `63/63`, audit/type/lint/build).
- Android code is unchanged from its clean `176/176`, assemble and lint run;
  the debug APK hash is recorded in the release manifest. Firmware code is
  unchanged from the clean production/development/OTA-profile builds; the OTA
  profile was not uploaded.
- ADB had `0` targets and no ESP32-S3 was attached. Candidate PostgreSQL,
  provider preview/live, Android production signing/runtime and physical
  flash/I2S/WSS/OTA rollback remain explicit evidence gaps.

## 2026-07-29 Phase 2 Portal Dashboard truthfulness/UI evidence

- Portal Dashboard now consumes the canonical `/api/v1/portal/overview` snapshot for the active workspace and requested local range. Exact measure/device/AI lifecycle totals are validated before rendering; missing or contradictory facts are not replaced by client-side zeros.
- Recent scans are a separate capability-gated, workspace-bound read. Their failure produces a partial-state panel without erasing confirmed KPIs, and raw `aiLabel` text no longer creates a synthetic review count.
- The independent Portal UI uses canonical Shcare primitives/tokens, responsive layouts, one route heading, 44 px actions and explicit loading/error/retry/offline/empty/permission behavior. Android patient/doctor dashboards remain native and are not pixel-matched; firmware is `N/A`.
- Evidence passed: focused Dashboard `7/7`, shared HTTP `21/21` (`28/28` total), Web `136/136` Auth/UI and `64/64` route contracts, lint/build, Chromium `306` checks over six routes × three viewport/theme cases, backend overview `4/4` plus integrated gates, OpenAPI `70` paths/`345` resolved references and clean diff check.
- This is source/build/local-browser evidence only. Firebase/live provider/database, deploy, Android runtime/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Portal Onboarding truthfulness/UI evidence

- Portal Onboarding now builds a checklist only from the current role's permitted `/me`, patient/device and Billing reads. Exact membership/workspace identity is required and no unauthorized supplemental query is issued.
- Failed, offline, malformed or cross-workspace data remains `Chưa xác minh`; it is not converted into a false incomplete setup step. Device-online completion requires backend `online=true`.
- The Portal implementation uses canonical Shcare primitives/tokens, responsive cards, one heading, 44 px actions, reduced-motion-safe progress and explicit loading/incomplete/unknown/error/retry/offline states. Android keeps its independent native first-run UI; Platform Admin and firmware are `N/A`.
- Evidence passed: focused Onboarding `4/4` after a deliberate red baseline, shared contracts `28/28`, Web `140/140` Auth/UI and `64/64` route contracts, lint/build and Chromium `363` checks over seven routes × three viewport/theme cases. The legacy/raw-style scan and diff check are clean.
- This is source/build/local-browser evidence only. Firebase/live providers/database, deployment, Android runtime/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Portal Help/support truthfulness/UI evidence

- Portal Help now uses canonical Shcare primitives/tokens and complete responsive validation/offline/submitting/retry/unsaved/confirmed states. Invented hotline/email/SLA text and legacy demo styling are removed.
- Support submission is a tenant ledger, not a local toast or self-notification. `/api/v1/portal/support` requires an idempotency key, derives workspace/requester authority at the backend and returns an exact owner-bound receipt. Migration `045`, JSON/PostgreSQL repositories and the importer preserve ticket, audit and replay state atomically.
- Evidence passed: focused Web `7/7`, support repository `4/4`, shared HTTP `22/22` (`29/29` total), Web `147/147` Auth/UI and `64/64` route contracts, lint/build, Chromium `420` checks over eight routes × three viewport/theme cases, backend integrated gates, OpenAPI `71` paths / `353` resolved internal references and clean diff check.
- Android and firmware are `N/A` for this Portal-only actor flow. Platform Admin support processing remains a later independent surface.
- This is source/build/local-browser evidence only. Firebase/live provider/database and deployment remain open. Provider support mutation is explicitly `BLOCKED` until a requester withdrawal/cleanup contract exists; the current live smoke no longer treats deletion of a notification as support-ticket cleanup.

## 2026-07-29 Phase 2 Portal workspace selection and contract evidence

- Portal Workspace Switcher now uses canonical Shcare primitives/tokens, one heading, responsive 44 px controls and explicit loading/session-denied/empty/offline/error/retry/switching/active/non-operational/unavailable-metric states. Missing backend counts remain unavailable rather than becoming zero.
- Shared HTTP request authority contains only `organizationId`. Web and Android use caller-owned idempotency and wait for exact backend workspace confirmation. Web additionally reconciles ambiguous responses through `/me` and isolates PHI queries before exposing changed authority.
- Android retains its independent native screen. Focused Android API/ViewModel tests passed; this does not prove emulator, physical-device or manual TalkBack behavior.
- Evidence passed: focused Web `10/10`, shared HTTP `23/23` (`30/30` total), Web `153/153` Auth/UI and `64/64` route contracts, TypeScript/lint/build, Chromium `459` checks over nine routes × three viewport/theme cases, backend check/workspace-access, focused Android workspace tests and clean diff check.
- Platform Admin and firmware are `N/A`; no migration or protocol changed. Firebase/live/provider/deploy, Android runtime/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Portal Workspace Settings UI-foundation evidence

- Portal Workspace Settings now uses canonical Shcare primitives/tokens, one heading, accessible responsive tabs, 44 px controls and explicit loading, denied, offline, validation, submitting, retry, unsaved and confirmed states.
- Initial Profile requests only authenticated `/me`; Security, Notifications and Workspace datasets load on demand. User/workspace ownership mismatches fail closed, and all editable drafts participate in the unload guard.
- Evidence passed: focused `12/12` after a `6/12` red baseline, Web Auth/UI `157/157`, route contracts `64/64`, TypeScript/lint/build and Chromium `525` checks across ten routes × three viewport/theme cases. CSS is `379.13 KB` raw / `59.20 KB` gzip and the route chunk is `50.32 KB` raw / `14.66 KB` gzip.
- Android keeps separate native Profile, Password, Notification and Workspace screens; no pixel parity is claimed. Platform Admin remains separate and firmware is `N/A`.
- This is source/build/local-browser UI evidence only. Phase 3 still owns stable retry idempotency and transaction/audit parity for legacy account/workspace mutations. Firebase/live/provider/deploy, Android runtime/manual accessibility, physical-device and firmware-HIL proof remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Portal Patients list/detail evidence

- Patient list/detail reads now fail closed on missing or foreign active-workspace identity. Patient Detail scan history additionally requires each source row to match both the active workspace and route patient; duplicate or mismatched scan identities produce a retryable error without rendering PHI.
- Workspace-scoped query keys/invalidation, dirty-create unload protection, canonical patient ID separation, canonical controls and view-only capability behavior are covered at component and browser layers.
- Recorded TDD evidence includes page `2` failed / `3` passed, contract/static `2` failed / `9` passed and the expected missing scan-parser export. Final evidence passed: Patient UI `6/6`, contract/static `12/12`, Web Auth/UI `160/160`, route contracts `66/66`, TypeScript/lint/build and Chromium `624` checks across twelve routes × three viewport/theme cases. CSS is `379.13 KB` raw / `59.20 KB` gzip; relevant chunks are Patients `11.98 KB` / `4.33 KB`, Patient Detail `14.09 KB` / `4.87 KB`, patient form `14.34 KB` / `4.10 KB`.
- Android Patient/Family/Profile UX remains independently native; Platform Admin remains a separate dense-management surface and firmware is `N/A`. No backend migration or protocol changed, and the earlier Patient CRUD/Import backend closures were not reopened.
- This is source/build/local-browser evidence only. Firebase/live provider/database/deploy, Android runtime/manual accessibility, physical-device and firmware-HIL proof remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Portal Patient Import evidence

- Patient Import validation now accepts only the exact active workspace and selected file identity. Batch refresh and commit require the exact workspace/batch identity, reject stale versions and expose success only after a strictly advancing committed receipt.
- Workspace/reset epoch isolation, mutually exclusive operations, old-response suppression and active-workspace Patient-cache invalidation are covered at contract/component/browser layers.
- Recorded TDD red evidence is parser `2/5` and Patient UI `5/8`. Final evidence passed: parser `5/5`, Patient UI `9/9`, contract/static `10/10`, Web Auth/UI `163/163`, route/contracts `68/68`, TypeScript/lint/build and Chromium `702` checks across thirteen routes × three viewport/theme cases. CSS is `379.43 KB` raw / `59.30 KB` gzip; Patient Import is `30.17 KB` raw / `9.06 KB` gzip.
- The browser run reproduced and fixed a light-theme file-label hover contrast defect. A route-harness navigation abort was separately fixed by waiting for Device Assignment to settle; neither issue is hidden as product success.
- Android is `N/A` for batch import by the locked surface boundary and retains a separate native Patient/Family UX. Platform Admin remains independent and firmware is `N/A`; the already closed atomic backend import was not rebuilt.
- This is source/build/local-browser evidence only. Firebase/live provider/database/deploy, Android runtime/manual accessibility, physical-device and firmware-HIL proof remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Portal Appointments evidence

- Portal Appointments now rejects missing, malformed or foreign workspace/appointment/patient/doctor/lifecycle/time identities for list, detail and mutation results. Detail uses the exact record endpoint; unchanged retries keep one idempotency key and workspace changes suppress late old-scope results.
- Dirty drafts are unload/discard protected. Create exposes a blocking retry state if the patient catalog fails. Backend and Web both prevent suspended, revoked, locked, unapproved or cross-workspace doctors from entering the assignable catalog or mutation.
- Recorded red evidence is the missing operation parser/export, initial Portal component `5/5` failures and backend suspended-doctor catalog assertion. The first browser run also reported two phone-light serious accessibility defects; semantic status contrast and valid definition-list structure were fixed before rerun.
- Final evidence passed: component `7/7`, focused operation/static `9/9`, Web Auth/UI `170/170`, Web contracts `73/73`, TypeScript/lint/build, Chromium `807` checks over fourteen routes × three viewport/theme cases, backend check plus appointment/workspace smoke, Android appointment `26/26` and `assembleDebug`, clean legacy scan and diff check.
- CSS is `378.84 KB` raw / `59.25 KB` gzip and Appointments is `36.25 KB` raw / `9.94 KB` gzip. Android retains an independent native appointment UI rather than matching Web; its debug APK is a source-verification artifact, not Firebase runtime or production-signing proof.
- Platform Admin remains independent and firmware is `N/A`; no migration, notification schema or device protocol changed. This is source/build/local-browser and focused Android unit/build evidence only. Firebase/live/provider/deploy, Android emulator/device/manual accessibility, physical-device and firmware-HIL proof remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Portal Review and Alerts evidence

- Review and Alert direct routes now use exact backend capabilities. List and mutation contracts require the active workspace plus canonical review/scan/alert/source identities; duplicate, malformed, foreign or stale data fails closed.
- Exact decision/transition receipts, stable workspace-bound idempotency and an operation epoch prevent false success or old-workspace publication. Backend Review responses add top-level `workspaceId`; shared schemas/fixtures and OpenAPI publish the same additive v1 contract.
- Recorded red evidence includes missing operation parsers, route-capability mismatch, absent Review workspace identity and four failing foreign/stale authority cases. The first browser sweep also found the missing Review card-heading semantics; the final sweep passed after correction.
- Final evidence passed: focused Web `21/21`, Web Auth/UI `174/174`, Web contracts `77/77`, package contracts `31/31`, TypeScript/lint/build, Chromium `939` checks over sixteen routes × three cases, backend check/clinical `8/8`/workspace-access, OpenAPI `76` paths / `394` resolved references / none missing and clean style/diff checks.
- Android retains its independently native Clinical Alerts UI and passes focused clinical/alerts `20/20` plus `assembleDebug`; no Portal layout was copied. Portal Review is clinician-worklist Web scope in this closure. Platform Admin remains independent and firmware protocol is unchanged.
- This is source/build/local-browser plus focused Android unit/build evidence only. Firebase/live provider/database/deploy, Android emulator/device/manual TalkBack, physical-device and firmware-HIL proof remain open or `BLOCKED`. Live Monitoring is the next Phase 2 target.

## 2026-07-29 Phase 2 Portal Live Monitoring evidence

- Portal Live Monitoring now distinguishes authenticated WSS realtime authority from REST fallback. REST carries only exact-workspace presence, scans, alerts and recording identity; waveform/metrics appear only after matching WSS status and session metadata.
- Contract validation rejects foreign or duplicate nested identities, missing canonical `online`, invalid timestamps and device secret/claim material. Legacy `connected=true` remains compatibility data and cannot mark a device online. Workspace change closes the old socket and suppresses late source events.
- Authenticated listeners no longer receive global ESP/listener counts or HTTP/UDP ports. Existing source-bound protocol-v2 frame sequencing, metadata-before-PCM, replay rejection, packet-gap reporting and cross-device audio isolation remain regression-tested.
- Recorded red evidence is the missing monitoring parser/schema, route-capability mismatch, absent workspace-bound backend projection and the Live component's false zero values. The device-security gate also exposed an old mutation test missing required idempotency; the harness was corrected so it reached and proved the intended telemetry-spoof and hard-delete guards.
- Final evidence passed: focused Live API/UI `9/9`, Web Auth/UI `183/183`, Web contracts `81/81`, package contracts `32/32`, TypeScript/lint/build, Chromium `987` checks over seventeen routes × three cases, backend check/workspace/clinical `8/8`/device-security `41/41`/audio-v2 `4/4`, OpenAPI `77` paths / `400` references / none missing and clean style/diff checks.
- Android retains an independent native LiveAudio contract/UI and passes focused `13/13` plus `assembleDebug`; no Web layout was copied. Platform Admin remains independent and firmware protocol is unchanged.
- This is source/build/local-browser plus focused Android unit/build evidence only. Firebase/live provider/database/deploy, Android emulator/device/manual TalkBack, physical authenticated audio and firmware HIL remain open or `BLOCKED`. Portal Devices/Consent is the next Phase 2 inventory.

## 2026-07-29 Phase 2 Portal Staff and Notifications source/local-browser evidence

- Staff and personal Notification inbox responses are now exact-authority contracts. Staff is bound to the active workspace and exposes a bounded operational projection; notification reads/mutations are bound to the authenticated owner and current workspace. Workspace changes clear stale state and suppress late outcomes before the new authority query is enabled.
- Shared HTTP v1 and OpenAPI publish the Staff response. Backend output excludes password, Firebase claims, 2FA/session/token/secret material. Notification read/delete remains atomic, idempotent and backend-confirmed; the existing data-only FCM wake-up contract is unchanged.
- UI evidence covers canonical primitives/tokens, responsive light/dark/system layouts, one route heading, 44 px controls, operational states and axe coverage for the Staff invitation dialog. Browser QA found and fixed Staff authority-label and global `select` light-theme contrast regressions.
- Final evidence passed: focused Staff/Notifications `14/14`, Web Auth/UI `204/204`, Web contracts `95/95`, package contracts `34/34`, TypeScript/lint/build, notification browser `66`, unified Chromium `1,374` checks across the 21 routes currently registered in the Portal matrix × three cases, backend check/workspace/staff `7/7`/notification inbox `8/8`/notification-contract, OpenAPI parse/reference checks, backend audit `0` and clean diff check.
- Android retains separate native membership/workspace and Notifications UI and is unchanged by this Portal closure. Platform Admin remains independent; firmware impact is `N/A`. No migration, device protocol, audio or OTA contract changed.
- This is source/build/local-browser evidence only. Live PostgreSQL/Firebase/provider/deployment, Android emulator/device/manual TalkBack, real delivery, physical-device and firmware-HIL proof remain open or `BLOCKED`. The next Phase 2 action compares unregistered Portal RouteContract aliases/details and then Public/Auth/Admin plus Android adaptive/runtime evidence; it is not permission to reopen closed work.

## 2026-07-29 Phase 2 Public Web UI foundation evidence

- All `22` Public RouteContract routes use one canonical Shcare shell, including the 404/maintenance state. Public pages use semantic light/dark/system tokens, truthful copy, responsive navigation/content/footer and controls of at least 44 px.
- Production Public markup no longer relies on demo glass/glow/gradient classes, autoplay hero media, infinite decorative loops or unverified hotline/customer/metric claims. Motion is one-shot, capped at four reveal items, opacity/transform-only and disabled by authoritative system reduced motion.
- Browser QA first reproduced Security scroll-region focus defects, Product/Pricing light-theme contrast defects and inactive Pricing label contrast. All were fixed before the final full-matrix rerun.
- Final evidence passed: Pricing `240/240`; Public browser `5,325/5,325` over `22` routes × `5` viewports × `3` themes; Web contracts `99/99`; Prettier, TypeScript, focused ESLint and client/SSR build (`2,525`/`178` modules). The browser matrix reports zero serious/critical axe issue, unexpected console/static/API error, horizontal overflow, sub-44 px interactive target, forbidden filter/backdrop/glow/gradient-heading effect, autoplay video or infinite animation.
- Main CSS is `427.56 KB` raw / `63.87 KB` gzip, token CSS `1.38 KB` gzip and self-hosted Vietnamese fonts total about `82.57 KB`, within the current CSS/font budgets.
- Android UI/UX remains independently native, Platform Admin remains independently dense and firmware impact is `N/A`; no Web layout was copied across surfaces and no backend/device contract changed.
- This is source/build/local-browser evidence only. Contact mutation browser proof, field Web Vitals, Firebase preview/live, provider/database, Android runtime/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`. Legacy `signal-horizon.css` and scoped precedence bridges remain explicit consolidation debt.

## 2026-07-29 Phase 2 Auth UI/state foundation evidence

- All `15` Auth RouteContract routes use one canonical responsive Shcare shell with light/dark/system, reduced-motion, 44 px controls and explicit loading/offline/recovery/error behavior.
- The reset-confirmation route now follows the Firebase action-code lifecycle: verify the code, mask the email, validate and confirm the new password, handle invalid/expired links and never expose the one-time code. Anonymous approval no longer fabricates status; verification copy no longer leaks provider implementation.
- Red evidence captured the wrong reset route, missing offline contract state and untruthful anonymous/provider copy before implementation.
- Final evidence passed: focused Auth `5/5`; Auth/UI `211/211` across `51` files; Web contracts `104/104`; TypeScript, focused ESLint, client/SSR build (`2,526`/`179` modules); Chromium `3,615/3,615` over `15` routes × `5` viewports × `3` themes (`225` visits); clean diff check.
- Main CSS is `427.77 KB` raw / `63.89 KB` gzip, token CSS is `1.38 KB` gzip and self-hosted Vietnamese fonts total about `82.57 KB`.
- Android retains an independently native Auth/recovery/approval UI and is unchanged; Platform Admin remains separate; firmware is `N/A`. No backend/device contract changed.
- This is source/build/local-browser evidence only. Valid live Firebase links, custom action-handler configuration, email delivery, preview/live deployment, Android emulator/device/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Platform Admin source/build/local-browser evidence

- Platform Admin now uses the canonical Shcare theme/shell, 44 px target floor, reduced motion, command palette, explicit offline and operational states, and accessible detail drawers while retaining its independent dense-management UX.
- Account behavior is backend-confirmed: read-only 2FA status and field-level notification preference `PATCH` with idempotency, owner-bound receipt validation and cleanup. No success is shown from local state alone.
- Runtime proof covers loading, 503, retry, empty, 403, real limited-principal direct-URL denial and drawer focus trap/Escape/restore. Browser QA found and fixed both a dark status-label contrast issue and a WebKit focus-return race.
- Evidence: contracts `169/169`, TypeScript/ESLint/client+SSR build, backend and Account smokes, Chromium `225` visits, critical Firefox/WebKit journeys, and aggregate `241` route / `19` Account cleanup / `19` drawer / `25` state / `5` direct-denial checks.
- This closes source/build/local-browser Admin foundation only. Firebase preview/live, provider/database runtime, Android emulator/device/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Android Settings and bounded clinical-status evidence

- Android Settings now fails closed on inactive/locked/deleted/mismatched authority, retains stale PII only for offline or HTTP 5xx recovery, invalidates the exact global authority epoch on confirmed mismatch and clears authority before logout termination. Accessibility covers headings, 48 dp targets and non-duplicated TalkBack announcements.
- Public status is health-only. Doctor and Portal status require authenticated exact-workspace authority and select realtime recording within that workspace. Android validates the returned workspace and retries a transient authority lookup; Portal no longer assumes the removed infrastructure `mode`.
- Independent review reproduced and fixed three clinical regressions and three Settings authority/accessibility issues before closure; no cross-tenant status disclosure was found.
- Backend evidence: clinical status `4/4`, check and workspace access. Web evidence: `105/105` contracts, TypeScript, ESLint, client/SSR build, notification-inbox browser `66/66` and Portal UI-foundation browser `1,374/1,374`. Android evidence: `78` suites, `449/449` tests, main and AndroidTest Kotlin compilation, debug assemble and lint.
- APK evidence is `23,906,757` bytes, SHA-256 `D1611B9E51D4E7DBC39DFE4106D307C58641688040E8CC94BA90CB9A56456BDD`.
- Firebase build is `BLOCKED` by six missing `VITE_FIREBASE_*` values. `app/google-services.json` and an attached ADB target are absent, so emulator/device, FCM, manual TalkBack/golden, provider/live, physical-device and firmware-HIL proof remain `BLOCKED`.
- Next Phase 2 evidence target is Patient Dashboard native foundation. Full live clinical dashboard and stop-scan UI remain Phase 5; firmware impact for this bounded status/Settings checkpoint is `N/A`.

## 2026-07-29 Phase 2 Patient Dashboard source/build/local evidence

- Backend `GET /api/v1/patient/dashboard` is versioned and authority-bound. Canonical `activePatientId` must resolve to a profile owned by the authenticated owner/account/guardian in the exact operational workspace; scans and device projection are restricted to that profile. Tenant/profile/scan/device mismatches fail closed.
- Shared HTTP v1 schema/fixture and OpenAPI match the production response. Android validates protocol version, user, workspace, active patient, scan and device identities before state publication.
- Native Android evidence covers repository/ViewModel authority epochs, locked/deleted/inactive denial, stale-data bounds, single-flight refresh, partial sections, exact dependent profile, typed/capability-gated navigation, adaptive 360/412/600/840 dp UI, large-font fallback, 48 dp/TalkBack/live regions, backend-confirmed presence and nullable `0%` battery. No AI result or success is invented.
- Final evidence passes backend patient-dashboard `7/7`, workspace-access, `check` and `npm test`; contracts `35/35`; Android focused `32/32`, full unit `473/473`, `compileDebugKotlin`, `compileDebugAndroidTestKotlin`, `assembleDebug` and `lintDebug`. APK is `24,001,564` bytes, SHA-256 `BDD617D4E175892660720BD9944F0A6055B200DDE5A1FFD792BB1DD45ACC22AE`.
- Runtime evidence remains `BLOCKED`: `google-services.json` is absent, ADB has no attached target, and emulator/golden/manual TalkBack/FCM/live-provider/physical-device/hardware proof has not run.
- Remaining P0 clinical presentation debt is `scanIsNormal` in `DashboardScreen`, `MedicalRecordsScreen` and `RecordDetailScreen`, assigned to Phase 5. Phase 2 remains in progress under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**; Deep Security remains untouched at `running/preflight`.

## 2026-07-29 superseding Patient Dashboard authority/retry evidence

- Master plan is **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**: Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending.
- Backend GET is a pure read; accepted idempotent active-profile PATCH is the only writer of `activePatientId`. Rejected deleted/foreign/wrong-workspace switches cannot bootstrap or persist a profile. Exact replay receipts and safe legacy-upgrade/stable-409 behavior are covered.
- Android closed-DTO parsing rejects coercible wrong types and invalid telemetry. Retry keeps one key through recoverable failures; exact confirmed subject change advances authority epoch and drops previous-profile back-stack PHI.
- New evidence: backend Patient Dashboard `9/9`, workspace/check/full/repository smokes; shared contracts `35/35`; Android focused `62/62`; full unit `487/487`; compile/AndroidTest compile/assemble/lint. APK `24,018,920` bytes, SHA-256 `751A9CDACB18B18D19C8CE88116D24B664451495FDFF2AC68EBD5BD9CF311C20`.
- Evidence class is source/build/local only. `google-services.json` is absent and ADB has no target, so emulator/golden/manual TalkBack/FCM/live-provider/physical-device/hardware remains `BLOCKED`. Phase 5 retains the three-screen `scanIsNormal` debt.
- After interruption, the newest handoff, ledger, current diff and generated proof are authoritative. Do not reopen a closed row without a reproduced regression; inventory the next genuinely open Phase 2 native row.

## 2026-07-29 Phase 2 account password source/build/local evidence

- Shared Web/Admin/Android business semantics are closed without copying UI across surfaces: client-side Firebase reauthentication, backend-only password mutation, stable required idempotency key, exact untrimmed secret handling, active account/workspace authority, exact owner-bound receipt and receipt-only logout.
- Backend provider state is durable and auditable. Replays do not call Firebase twice; ambiguous crash windows require reconciliation. A reproduced concurrent Firebase deletion race now fails closed because `reset_password` requires `updated: true` rather than accepting `firebaseAlreadyMissing`.
- Web and Admin use independent responsive account interfaces. Web auth callbacks and cleanup are UID/token/attempt-owner safe across account replacement. Android uses its own Compose repository/ViewModel/state/effect flow, authority epoch, native IME/inset/TalkBack/48 dp handling and replacement-account-safe cleanup.
- Evidence: backend Firebase/password `22/22`, check/full/repository/workspace/KLT; shared contracts `29/29`; Web Auth/UI `227/227`, Web contracts `105/105`, lint/build and Portal browser `1,374/1,374`; Admin contracts `175/175`, lint/build and targeted `/account`; Android `86` suites / `518/518`, compile/AndroidTest compile/assemble/lint.
- Debug APK is `24,066,508` bytes, SHA-256 `5DC07A7E02A0F97FB62C80FBD1201EDBE5E3E2174F71F335FBCA053917DE9FD0`.
- Evidence class is source/build/local only. No `google-services.json` or attached ADB target exists; live Firebase/PostgreSQL/provider, full Admin browser matrix, emulator/device/manual accessibility, production signing, physical device and firmware HIL remain open or `BLOCKED`. Firmware impact for this workflow is `N/A`.
- Phase 2 remains in progress under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Restart from the newest handoff/ledger/current diff/proof and inventory the seven tracked direct-API Android screens before selecting the next bounded non-clinical foundation row.

## 2026-08-01 registration, verification and role-request evidence

- Shared semantics: exact account/workspace/membership authority, stable intent/document idempotency, exact lifecycle/receipt, tenant-scoped audit and no success before backend confirmation. Web and Android retain separate responsive/browser and native-mobile UI/UX.
- Web evidence: Auth/UI `57` files / `288/288`, contracts `105/105`, TypeScript, ESLint and client+SSR build; final review reports no P0/P1 in the reviewed registration/approval scope.
- Backend evidence: role-document repository `13/13`, shared contracts `38/38`, syntax/check, base smoke, isolated workspace-access and repository smoke. Tests cover arbitrary-clinic denial, stream-time 10 MiB rejection, cross-tenant import denial, ordinary precommit cleanup and the exact concurrent winner/loser deletion race. Final review reports no P0/P1 in scope.
- Android evidence: six focused suites / `40/40`; full 93 suites / `579/579`; main and AndroidTest Kotlin compile, assemble and lint. Behavioral tests cover paused A→B logout, incoherent verification/approval workspace, strict ACK types and inactive notification session on malformed receipt. Cross-review reports no P0/P1 in scope.
- Debug APK: `24,123,768` bytes; SHA-256 `C0230EB545E4BFA34D9EE68857CC0FE9C6C1C2217783F3874557F08E338FE7E6`.
- Evidence class is source/build/local. Live PostgreSQL/Firebase/FCM/provider, emulator/device/manual TalkBack/golden, physical-device and firmware HIL remain open or `BLOCKED`. Firmware impact for this identity workflow is `N/A`.
- Phase 2 remains in progress. The inventory selects Doctor Approval architecture-bound native foundation next, followed by SignUp; Dashboard/Live/Medical Records/New Scan remain in Phase 5.

## 2026-08-02 bằng chứng Phase 2 Android auth/session owner

- Master plan là **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**: Phase 0–1 đã hoàn tất, **Phase 2 vẫn đang thực hiện**, Phase 3–8 còn pending. Mục này bổ sung bằng chứng mới, không sửa các hàng lịch sử và không đóng Phase 2.
- Phạm vi chức năng đã sửa dùng exact `FirebaseOwnerBinding` xuyên Splash/Login/SignUp/Verify/Doctor. Năm P1 đã đóng: Verify recapture, Doctor ABA owner, stale termination replacement, reauthorization global clear và workspace/profile stale global teardown.
- Workspace/profile confirmation bắt buộc khớp exact `MobileSessionAuthority` snapshot; same-identity/new-epoch bị từ chối. Không còn global `authorityStore.clear()` hoặc `SmartHealthSessionTerminator.terminate()` trong `AppNav`.
- Review độc lập cuối cùng: P0 `0`, P1 `0`, P2 `0` trong các đường đã sửa. P2 còn mở ngoài phạm vi là partial SignUp abandonment/back có thể để Firebase owner trên public Login.
- Android unit đạt `98` suites / `655` tests với failures `0`, errors `0`, skipped `0`. Gate `:app:compileDebugAndroidTestKotlin :app:assembleDebug :app:lintDebug --rerun-tasks` `BUILD SUCCESSFUL` trong `4m43s`, `56` tasks. Lint có `43` warnings, `0` errors, `0` vấn đề auth/session trong phạm vi; `git diff --check -- smart-health-android` sạch.
- APK debug `24,172,920` bytes, SHA-256 `CEB6BFC23995B361AD0BD23B24F4F836E0464BCB215105C8A6EDE8BACDAC5F69`.
- Lớp bằng chứng là source/build/local. `app/google-services.json` vắng mặt và ADB trống, nên Firebase/provider/navigation runtime trên emulator/thiết bị vẫn `BLOCKED`; không được suy ra từ test/build/APK.
- Ma trận tiếp theo là kiểm toán hoàn tất Phase 2 foundation trên Web foundation và Android native foundation. Dashboard, Live, Medical Records, New Scan và audio vẫn thuộc Phase 5.

## 2026-08-02 bằng chứng Web CSS A và Android adaptive foundation

| Surface | Source/build/local proof | Runtime/provider proof | Trạng thái |
|---|---|---|---|
| Web/Portal CSS foundation | Retired selector consumers `0`; Portal opaque/no-blur, semantic mobile `h1`; debt `1,909 → 1,839`; contracts `112/112`, TypeScript/build/lint; Chromium Portal `1,374` + Public `5,325` checks pass | Firefox/WebKit critical, visual snapshot, performance chưa chạy | Phase 2 mở |
| Android adaptive foundation | Typed compact/rail/two-pane, exact 600/840dp, list/detail + Back/selected semantics; `99` suites / `660/660`; AndroidTest compile, assemble/lint; APK SHA-256 `AF2E8648AF12B2F360B1AE2FA7DEC59386C52872185D4605001BC353F800F66B` | ADB trống; Espresso runtime, TalkBack, font-200% geometry/golden, FCM/provider chưa có | `BLOCKED` ở runtime |

- Không còn bounded P0/P1 sau review cuối trong hai lát đã sửa. P2 large-font navigation visual proof, SignUp abandonment/back, CSS debt và Android resource/deep-link/testTag vẫn mở.
- Bằng chứng build không thay thế browser/emulator/device/provider/hardware. Phase 2 vẫn đang thực hiện; Phase 5 vẫn sở hữu Dashboard/Live/Medical Records/New Scan/audio.

## 2026-08-06 Phase 2 closure audit và correction

| Surface | Exit proof source/build/local | Bằng chứng chưa có | Kết luận |
|---|---|---|---|
| Web/Public/Auth/Portal | Foundation `27/27`, contracts `114/114`, Auth/component `288/288`, TypeScript/lint/build; CSS `62.10 kB gzip`, fonts `82,572 bytes`; Portal Chromium `459`, Firefox `458`, WebKit `459`; Public Firefox/WebKit critical `16` checks mỗi lượt | Visual snapshot và live LCP/INP/CLS; initial graph còn khoảng `270,304 bytes gzip`; CSS debt/composite wrappers | Audit xanh nhưng Phase 2 chưa PASS |
| Android native foundation | Focused `5` suites / `32` tests; main Kotlin và AndroidTest Kotlin compile; diff check sạch | Không có Firebase config/ADB target; resource/testTag/deep-link/golden/font-200%/provider/device còn mở hoặc `BLOCKED` | Audit xanh nhưng Phase 2 chưa PASS |

- Phase map chính thức vẫn là Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending. Không suy diễn runtime/device từ build và không gọi Phase PASS khi còn nợ.
- Session-revoke receipt được khởi động sớm; hoàn tất đồng bộ để tránh nửa tích hợp rồi quay lại Phase 2. Firmware impact `N/A`; việc này không phải Phase transition.

## 2026-08-15 Phase 4 closure evidence and Phase 5 gap matrix

Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](../SHCARE_REBUILD_MASTER_PLAN.md)**.

| Surface | Source/build/local evidence | Missing runtime evidence | Verdict |
|---|---|---|---|
| Backend OTA/private artifact | Check PASS; OTA/repository `24/24`; HTTP `8/8`; ownership/storage `67/67`; delivery/execution TTL and token revocation atomic | Live provider/fleet canary | Phase 4 source/local CLOSED |
| Android device Phase 4 | `109` suites / `793` tests; unit/assemble/lint PASS; APK SHA-256 `DCEEEC05251FAE3AD475F5C1F4B41CA6D43E9728AC68C961553E57F9BAF47B34` | Firebase config, ADB, emulator/device/manual proof | Source/build CLOSED; runtime `BLOCKED` |
| Firmware OTA Phase 4 | Source contract + production/OTA build PASS; RAM `52,864 / 327,680`; flash `1,120,489 / 6,291,456`; two binary hashes recorded in ledger | Native `gcc/g++`; flash/provision/audio/forced rollback | Source/build CLOSED; HIL `DEFERRED — chờ phần cứng` |
| Phase 5 scan/audio | Audio v2 and five backend lifecycle regressions reproduced; implementation active | WSS live, Android device audio, physical microphone | OPEN / RED |

- Phase map: Phase 0–4 closed at their software/source/build/local gates; **Phase 5 active**; Phase 6–8 pending. The whole plan is not PASS.
- The `77/82` device-security run includes five new Phase 5 RED cases and must not be presented as a green aggregate or as a Phase 4 regression.
- Deep Security remains separate at `running/preflight`.

## 2026-08-22 Phase 5 exit and Phase 6 entry matrix

Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](../SHCARE_REBUILD_MASTER_PLAN.md)**.

| Surface | Phase 5 source/build/local evidence | External proof status | Verdict |
|---|---|---|---|
| Backend | Device `82/82`; clinical `8/8 + 4/4`; audio `4/4 + 6/6` | Live/provider | Phase 5 source/local CLOSED |
| Web/Portal | Clinical/live `28/28`; contracts `12/12`; TypeScript/lint/client+SSR build | Provider/live browser | Phase 5 source/build CLOSED |
| Android | `116` suites / `830` tests; AndroidTest compile/assemble/lint; APK SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7` | Firebase/ADB/device `BLOCKED` | Phase 5 source/build CLOSED |
| Firmware | SHC2 audio-v2 source/build; SHA-256 `CC53E0084BB699BC4787FC10DD20E1AFEC3454E46A05286DE61B56671F357EF6` | Physical HIL `DEFERRED — chờ phần cứng` | Phase 5 source/build CLOSED |
| Phase 6 | Appointment/consent/alert/notification impact inventory and implementation | Provider/runtime proof separated | ACTIVE |

- Phase 0–5 are complete only at their software/source/build/local boundary. Phase 6 is active; Phase 7–8 pending; overall plan NOT PASS.

## 2026-08-22 Phase 6 exit and Phase 7 entry matrix

Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](../SHCARE_REBUILD_MASTER_PLAN.md)**.

| Surface | Phase 6 source/build/local evidence | External proof status | Verdict |
|---|---|---|---|
| Backend/contracts | Appointment soft-delete migration/idempotency/audit/tenant denial; consent/alert/notification gates; shared contracts `49/49` | Provider/live | Phase 6 source/local CLOSED |
| Web/Portal | Appointment strict receipt + destructive retry UX; focused contracts/components; TypeScript/lint/client+SSR build | Provider/live browser | Phase 6 source/build CLOSED |
| Platform Admin | Contracts `183/183`; lint and client+SSR build | Live Admin/provider | Source/build CLOSED; Phase 7 audit ACTIVE |
| Android | `116` suites / `830` tests; AndroidTest compile/assemble/lint; APK SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7` | Firebase/ADB/device `BLOCKED` | Phase 6 source/build CLOSED |
| Firmware | No Phase 6 firmware change required | Physical HIL `DEFERRED — chờ phần cứng` | Compatibility verdict PASS |

- Phase 0–6 are complete only at software/source/build/local boundary. Phase 7 is active; Phase 8 pending; overall plan NOT PASS.

## 2026-08-22 Phase 7 exit and Phase 8 entry matrix

Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](../SHCARE_REBUILD_MASTER_PLAN.md)**.

| Surface | Phase 7 source/build/local evidence | External proof status | Verdict |
|---|---|---|---|
| Backend/contracts | Shared `50/50`; backend check; admin-list `3/3`; workspace-access and repositories; bounded query/paging contract with legacy body compatibility | Provider/live | Phase 7 source/local CLOSED |
| Platform Admin | Patients/Doctors/Devices/Packages/Storage use backend query/paging and full-ledger facets/summaries; contracts `185/185`; lint and client+SSR build | Live Admin/provider | Phase 7 source/build CLOSED |
| Web/Portal | No Phase 7 production change required beyond shared-compatible backend responses | Provider/live browser | Compatibility verdict PASS |
| Android | No Phase 7 UI surface required for platform-only list management | Firebase/ADB/device `BLOCKED` | `N/A` with compatibility PASS |
| Firmware | No Phase 7 firmware change required | Physical HIL `DEFERRED — chờ phần cứng` | `N/A` with compatibility PASS |

- Phase 0–7 are complete only at software/source/build/local boundary. Phase 8 is active; overall plan remains NOT PASS until RC/demo and required release gates are recorded.

## 2026-08-22 Phase 8 RC2 local-demo matrix

Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](../SHCARE_REBUILD_MASTER_PLAN.md)**. Exact artifact identities are in the [RC2 manifest](../SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md).

| Surface | RC2 local evidence | External proof status | Verdict |
|---|---|---|---|
| Backend/contracts | check/base/KLT/admin-list/workspace/repositories; shared `50/50`; audit 0 vulnerabilities; isolated demo readiness/login | PostgreSQL/S3/Firebase/provider/public HTTPS/secrets `BLOCKED` | Local source/demo PASS |
| Web/Portal | `390/390 + 123/123`; type/lint/build; audit 0; real local doctor login | Firefox/WebKit RC2 and Firebase preview/live open | Local source/demo PASS |
| Platform Admin | `186/186`; lint/build; 72-route Chromium matrix with axe/permission/mutation/cleanup; no high/critical audit | Preview/live provider `BLOCKED` | Local source/demo PASS |
| Android | `116` suites / `830` tests; AndroidTest compile/assemble/lint; APK hash recorded | Firebase config, ADB/device, production signing and manual TalkBack `BLOCKED` | Source/build PASS |
| Firmware | Version `1.0.1`; production and OTA PlatformIO builds and hashes recorded | Physical target/partition/flash/I2S/WSS/ACK/rollback `DEFERRED — chờ phần cứng` | Source/build PASS |

- Local demo is ready. Phase 8 and the overall plan are not PASS until every required non-deferred release gate closes; no provider/runtime/hardware result is inferred from source/build evidence.
