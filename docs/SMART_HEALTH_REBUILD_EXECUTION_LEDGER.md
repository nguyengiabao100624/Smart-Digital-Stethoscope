# Shcare rebuild execution ledger

Updated: 2026-07-23

This ledger turns the accepted Shcare Web, Portal, Platform Admin, Android, backend and MSM261S4030H0 firmware plan into verifiable slices. It is an execution record, not a completion claim.

## Baseline and preservation

- Baseline Git revision: `bf0d08cdd70d9c89ea4dd1b53fcf3e95578d026a` with pre-existing tracked and untracked work preserved.
- Allowlisted external backup: `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-baseline-20260714`.
- Baseline manifest SHA-256: `487ccbd8c00b7164f10e4d4f9e71f08208ffc745e4c6a4c43f7c6942bef93c8a` covering 32 active work files.
- No reset, stash-all, force-push, destructive checkout or broad staging is authorized.
- Platform Admin CodeGraph was initialized locally at `smart-health-admin/thiết kế giao diện/.codegraph`; the index stays untracked.
- Canonical surfaces are `smart-health-web`, `smart-health-admin/thiết kế giao diện`, `smart-health-android`, `smart-health-embedded/web-monitor`, and `smart-health-embedded/MSM261S4030H0`. `Smart-Digital-Stethoscope` and `main_backup.cpp` are legacy/non-canonical.

## Proof classes

| Proof | Meaning | May close production DoD? |
| --- | --- | --- |
| Source | Contract/static review and targeted tests | No |
| Build | Lint/typecheck/unit/build or firmware compile | No |
| Simulated | Browser fixture, device simulator, contract fixture | Only simulated acceptance |
| Emulator/device | Android runtime, permissions, TalkBack, FCM, lifecycle | Required for mobile runtime claims |
| Hardware | ESP32-S3 flash, serial, I2S, secure WSS, command ACK, OTA rollback | Required for firmware/device claims |
| Provider/live | Firebase/Render/Postgres/storage/email/FCM/live hosting | Required for deployed/provider claims |

Any unavailable emulator, board, credential or provider is recorded as `BLOCKED`; source/build success never substitutes for that proof.

## Route, actor, state and action matrix

| Surface | Actor source of truth | Navigation rule | Mandatory state coverage | Mutation confirmation |
| --- | --- | --- | --- | --- |
| Public Web | Public route contract | URL remains stable | loading where dynamic, error, maintenance, 404, reduced motion | Backend/provider response only |
| Auth Web | Firebase identity plus backend onboarding status | Auth shell route contract | field/server errors, upload progress, recovery, unsaved guard | Firebase/backend persisted result |
| Portal | Backend membership and capability | Menu and direct URL read the same contract | loading, empty, partial/stale, offline, retry, 403, destructive busy | Backend persisted result; device result only after ACK |
| Platform Admin | Backend platform capability | Permission is independent of menu visibility | loading, empty, error, retry, 403, mutation review | Backend persisted/audited result |
| Android | Backend membership/capability plus typed mobile route | Patient and doctor native IA; deep-link allowlist | loading, empty, error, offline, retry, permission, lifecycle interruption | Backend/device/provider confirmation at correct layer |
| Firmware | Authenticated device session | No human navigation | disconnected, authenticating, online, degraded, revoked, OTA states | Correlated ACK/progress/result and reconnect health |

## P0/P1 bug ledger

| ID | Severity | Problem | Exit evidence | Status |
| --- | --- | --- | --- | --- |
| SEC-WS-001 | P0 | Device socket can be registered or send binary before authentication | Challenge-response negative tests; registry empty before auth | Source/simulated verified; hardware BLOCKED |
| SEC-SECRET-002 | P0 | Device secret appears in URL/hello/log or SQL/JSON verification differs | URL/log scan; SQL/JSON proof fixtures; constant-time auth test | Source/simulated verified; live BLOCKED |
| SEC-REVOKE-003 | P0 | Revocation does not close active socket or block presence/audio | Active-socket revoke test and reconnect denial | Source/simulated verified; hardware BLOCKED |
| AUDIO-ISO-004 | P0 | Global recording can accept audio from another device | Two-device negative test bound to workspace/patient/device/scan | Source/simulated verified; browser/device proof pending |
| FW-CMD-005 | P0 | Firmware command payload/state contract drifts from backend | Versioned fixture, parser tests, correlated ACK/progress/result | Contract/build verified; HIL BLOCKED |
| FW-OTA-006 | P0 | Insecure TLS, optional hash, unsigned/no rollback OTA | CA validation, required SHA-256/signature, downgrade/target checks, HIL rollback | Source/native tests/build verified; real keys/backend signer/HIL rollback BLOCKED |
| AND-FAKE-007 | P0 | Fake QR/Bluetooth pairing and seeded AI diagnostics | Real QR/manual claim; no BLE claim; no seeded production data | QR/manual claim and AI source/build/mock-provider verified; emulator/device/live-provider BLOCKED |
| AND-FCM-008 | P0 | FCM logs only and preferences overwrite Portal | Display/channel/deep-link/permission and field PATCH tests | Android/backend source and unit smokes verified; provider/device BLOCKED |
| UI-SYS-009 | P1 | Web CSS/primitive fragmentation and old demo styling | Brand tokens, canonical primitives, route sweep, CSS budgets | Brand/Auth/route foundation verified; remaining route migration in progress |
| AND-UI-010 | P1 | Raw Compose styling, weak dark/adaptive/state semantics | Native theme/components/goldens/semantics/runtime pass | Foundation/appointment build verified; remaining screens and runtime pending |
| DATA-FAKE-011 | P1 | Admin/Portal fake counts, toast-only actions or seeded AI | Real API/read-after-write/cleanup smoke | Notifications, Overview, Storage D2A, Patient CRUD/Import and Audit/Export source/local closed; remaining surfaces pending by slice |
| APPT-APP-012 | P1 | Appointment workflow absent on Android | Native list/detail/create/reschedule/cancel tests | Backend/Android source, contract and build verified; live database/emulator/device BLOCKED |
| CONSENT-013 | P1 | Consent/access actor semantics are conflated | Versioned actor/scope/expiry/revoke/audit tests | Source/local verified across backend, Web and Android; live PostgreSQL/browser/emulator proof BLOCKED |
| LIVE-WSS-014 | P1 | Portal LIVE uses REST polling while claiming live audio | Authenticated WSS waveform/reconnect/source identity smoke | Contract/source verified; browser runtime pending |
| SEC-2FA-015 | P0 | 2FA can be enabled locally or bypassed before a real server challenge | Encrypted enrollment, bounded challenge, replay/cross-user/concurrency negatives, client fail-closed flow | Backend/Web/Android source, unit and browser verified; PostgreSQL/Firebase/live-device BLOCKED |
| DEP-AUDIT-016 | P2 | Backend dependency tree contained two high-severity advisories | Upgrade supported direct dependencies, modular Firebase compatibility smoke, audit with no high/critical | Nodemailer/Firebase Admin upgraded; 0 high/critical, 6 upstream moderate remain tracked |
| IDENTITY-017 | P1 | Profile, family, workspace and session flows can false-confirm, retain stale access or split provider/backend state | Canonical per-request membership truth, atomic/reconcilable identity provisioning, audited session/provider lifecycle, read-after-write clients and cross-instance negative tests | Source/local verified on the integrated repo; live PostgreSQL/Firebase and Android runtime proof remain BLOCKED |
| MEMBERSHIP-018 | P1 | Suspended membership can retain owner, notification, scan/audio or paired-device authority | JSON/SQL importer and repository negatives plus suspend/reactivate HTTP smoke | Source/local verified; live PostgreSQL/provider/device proof BLOCKED |

## Feature impact records

| Feature | Actor | API/event | Web | Admin | Android | Firmware | Deploy/rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Device authentication | Provisioned device, platform device admin | WSS auth v1 challenge/response | Device presence only | Provision/revoke/status | Own-device status; claim later | HMAC challenge response; no URL secret | Backend first behind protocol flag; firmware canary; previous protocol compatibility window |
| Device command | Authorized workspace/platform operator | Versioned command/status | Send accepted vs applied copy | Command/OTA state | Own-device actions only when capability allows | Dedupe, expiry, ACK/applying/result | Backend before clients; firmware minimum-version gate; disable flag for rollback |
| Audio session v2 | Patient/clinician/device | Metadata header plus binary PCM | Portal listener/recording source | Operational status only | Guided scan/live/playback | Sequence/timestamp/identity frames | Backend dual v1/v2 window; per-client feature flag |
| Notification/FCM | User and authorized sender | Shared notification delivery/preferences | Portal inbox/preferences | Audience/provider settings | Channel/display/deep link/field PATCH | Indirect source event only | Backend schema first; Android internal track; provider proof separate |
| Appointment | Patient, doctor, workspace staff | Appointment lifecycle and audit | Full clinic operation | Platform read only when justified | Native patient/doctor workflow | N/A: no device actor | Additive backend first; clients can independently rollback UI |
| Device claim/pairing | Patient or authorized workspace member | Idempotent QR/manual claim plus authenticated WSS presence | Own/workspace device status | Provision, revoke and fleet status | Native QR scanner, manual recovery and awaiting-online state; BLE N/A until a real GATT contract exists | Claim proof, secure setup and authenticated presence | Backend additive first; Android feature flag/internal track; hardware confirmation required before release |
| Signed firmware OTA | Platform device administrator and claimed device | Canonical signed manifest plus OTA lifecycle | Read-only maintenance state when authorized | Fleet delivery, progress and rollback state | Own-device firmware/maintenance status only | HTTPS/CA, SHA-256, pinned signature, target/protocol/SemVer checks, A/B boot confirmation | Backend signer before canary; fail closed without injected CA/public key; previous image retained for rollback |
| AI-assisted analysis | Patient and clinician within workspace scope | Provider availability plus provider-confirmed conversation; fail closed without provider | Honest empty/unavailable/retry states | Provider readiness only; no fabricated metrics | Native loading/empty/unavailable/error states and clinical disclaimer | N/A: no device-side AI actor | Backend/provider configuration before clients; disabling provider returns unavailable without local fake success |
| Identity and 2FA | Account holder with Firebase or demo primary identity | Enrollment/status/challenge/session-bound secondary token | Unified Auth shell plus account-security setup | Platform capability only; cannot bypass account factor | Native credentials/OTP steps and account-security flow; secondary token remains memory-only | N/A: no firmware actor | Additive backend first; clients fail closed when key/provider unavailable; revoke secondary token on disable/logout |
| Account, family and workspace context | Account holder, dependent guardian and authorized workspace member | `/me`, profile/avatar, active profile, membership switch and auth-session lifecycle | Account settings only confirm persisted responses; workspace 403 does not hide the whole account surface | Platform account actions require canonical capability and audited lifecycle | Native Profile/Family/Workspace screens with independent mobile layout, stable idempotency and explicit offline/permission states | N/A: no firmware actor | Additive backend first; do not promote until identity provisioning, revoke/lock and cross-instance membership checks are clean |
| Consent and data access | Patient, guardian, clinician and authorized workspace operator | Versioned patient-share contract with authority type, purpose, recipient, scope, expiry, revoke, idempotency and audit | Portal consent route uses exact backend lifecycle and fail-closed read-after-write | Platform Admin does not impersonate patient consent; operational settings stay separate | Native Compose Data Access screen with independent mobile state/navigation and no Web component reuse | N/A: no firmware actor or command | Apply additive migration 036/backend first; Web and Android may roll back independently; do not promote without tenant negatives |
| Brand/UI foundation | All actors | No domain mutation | Web brand package/primitives | Shared brand tokens via adapter | Native `ShcareMobileTheme`, not Web components | Setup page follows terminology only | UI releases independent; compatibility verdict records firmware N/A |
| Overview statistics | Platform Admin and authorized workspace member | `GET /admin/overview-stats` and `/portal/overview` with `today|7d|30d` plus timezone offset | Portal reads the same tenant/range contract through its own responsive shell | Dense dashboard with strict parser, stale/error/empty states and semantic charts | N/A: mobile dashboards are actor-specific native workflows, not the Platform/Portal aggregate | N/A: no device command or telemetry schema change | Backend additive contract first; Admin/Portal may roll back independently; live deploy proof remains separate |
| Platform storage read state | Platform Admin and authorized storage viewer | Existing storage stats/files aliases; no schema change | Portal keeps its own browser shell where exposed | Independent stats/files settlement, strict parser, partial/stale/retry states and semantic charts | N/A: Platform Storage is intentionally Web/Admin-only | N/A: no device or firmware contract changed | Admin client may roll back independently; S3/live mutation proof stays separate |
| Patient CSV import | Authorized workspace patient manager or Platform Admin | `POST /patients/import/validate`, `GET /patients/import/:batchId`, `POST /patients/import/:batchId/commit` | Native Portal three-step preview/commit flow | No duplicate Admin composer; platform capability may use the same canonical API | N/A: bulk operational import is intentionally desktop-only | N/A: no device actor or protocol change | Apply migration 042/backend first; Portal client second; rollback client independently while keeping `/api/v1` compatibility |
| Audit ledger and export | Platform auditor, workspace owner/admin, clinician or patient with an explicit export scope | `GET /audit-logs`, compatibility aliases, and `/exports` create/list/download with server filters, paging, idempotency and audit | Workspace audit/report UX remains separate from Admin | Dense platform/workspace audit and export management; platform-global audit is capability-gated | N/A for workspace/platform audit UI; personal export/access history is a separate native Settings/Security slice | N/A: no device actor or protocol change | Apply migration 043/backend first; Admin and Portal may roll back independently; live DB/provider/promotion proof remains separate |

## Current execution order

1. Close device authentication, secret, revoke and audio-source P0 with backend tests and device contract fixtures.
2. Keep Web/Admin brand foundation and Android native foundation independent while preserving business terminology.
3. Complete identity/profile/security, then device provision/claim/command, then scan/audio/review.
4. Complete appointment, consent, alert, notification, remaining admin operations and data cleanup.
5. Run whole-system QA/security/performance, build a clean candidate and create a version compatibility manifest.
6. Deploy only when provider and rollback gates pass. Hardware/provider gaps remain explicitly `BLOCKED`.

## Verification log

### 2026-07-14 — Phase 1 device security and audio protocol v2

- Shared `@shcare/contracts`: 6/6 tests passed, including closed auth/command schemas, bound audio-session command, v2 identity schema and a cross-language golden binary frame.
- Backend syntax gate: `npm.cmd run check` passed.
- Backend regression: `npm.cmd test` passed.
- Audio v2 parser/sequence smoke: 4/4 passed.
- Device security smoke: 9/9 passed, including pre-auth denial, SQL/JSON one-way secret parity, bounded frames, active-socket revocation, source binding and replay rejection.
- Workspace access, repository metadata and KLT contract smokes passed.
- Web realtime/route/theme contracts: 14/14 passed; targeted ESLint for realtime and LIVE Portal files passed.
- Firmware normal and OTA-environment compilation produced `firmware.bin` with RAM 52,008/327,680 bytes and flash 1,044,001/6,291,456 bytes. The OTA environment was compiled only; no upload target was configured.
- PlatformIO identifies the selected board profile as 8 MB while the accepted hardware target requires physical confirmation of 16 MB and its partition table. Flash size, I2S, secure WSS, command ACK, OTA success/failure and rollback remain `BLOCKED` until a board is connected.
- Notification email provider output explicitly reported Brevo unavailable; this is provider evidence of a blocker, not a successful delivery claim.

### 2026-07-14 — Web Auth and Android native appointment foundations

- Web Auth component tests passed 16/16 and Web contract tests passed 14/14.
- The repeatable Chromium Auth sweep passed 126/126 route, viewport and theme combinations across 390/768/1440 and `light|dark|system`, with reduced motion, zero serious/critical axe findings, zero console/static-asset errors, zero horizontal overflow and no undersized standalone target.
- The browser gate first failed on an insufficient light-theme select contrast and 20–40 px Auth actions; both defects were fixed before the green rerun.
- Full Web ESLint and production build passed. Final CSS is 58.77 KB gzip; Shcare fonts remain 82.57 KB total.
- Android appointment/native foundation compiles after replacing inline ViewModel messages with string resources through the Compose boundary.
- Android `testDebugUnitTest` passed 39/39; `assembleDebug` and `lintDebug` passed. This covers repository/ViewModel/notification/navigation/foundation unit behavior but is not emulator proof.
- `adb devices -l` returned no attached emulator/device. Compose runtime, TalkBack, permission, FCM display/deep-link and lifecycle checks remain `BLOCKED` until WHPX or a physical device is available.
- Platform Admin route/device-secret contracts passed 8/8; full Admin ESLint and production build passed.

### 2026-07-14 — Android QR pairing, AI states and production manifest hardening

- Android device pairing now uses Google Code Scanner or a manual one-time claim code. The canonical route is `device-pairing`; the old `bluetooth` route is only a compatibility alias and does not expose a Bluetooth workflow.
- Pairing uses a stable idempotency key, blocks rapid duplicate submission and waits for authenticated WSS online presence before rendering connection success. An accepted REST claim is displayed as awaiting device confirmation, not as connected.
- Backend pairing security smoke passed 10/10, including QR/manual-only validation, Bluetooth/BLE rejection, tenant-scoped idempotency, replay/fingerprint checks, audit persistence and offline/online outcome separation.
- Android AI chat no longer seeds a diagnostic or conversation. It renders loading, empty, unavailable, error and retry states and replaces the timeline only with backend-confirmed messages.
- Shared HTTP/device contracts passed 8/8, including AI unavailable and provider-confirmed fixtures plus device v1/v2 contracts.
- Full Android `testDebugUnitTest` passed 55/55 across 11 suites; `assembleDebug` and `lintDebug` passed. Lint reported 48 legacy warnings with zero Error/Fatal findings.
- The release manifest resolves `usesCleartextTraffic=false` and `allowBackup=false`; sensitive backup domains are excluded. Debug keeps cleartext only for local emulator development.
- No emulator/device is attached, so camera permission, QR runtime, TalkBack, FCM display/deep-link, encrypted cache/outbox and lifecycle behavior remain `BLOCKED`. Provider delivery and physical device proof are also not claimed.
- Backend AI smoke passed 5/5: fail-closed provider readiness, tenant-scoped provider-confirmed history, concurrent idempotency, cross-tenant key isolation and timeout without fake history/audit. Backend check, workspace-access, repositories, appointment, device-security, base smoke and KLT contract gates all passed independently.
- AI provider evidence uses a local OpenAI-compatible mock. No live AI credential or `DATABASE_URL` is present, so provider-live and PostgreSQL transaction/migration proof remain `BLOCKED`.

### 2026-07-14 — MSM261S4030H0 signed OTA source and build gate

- Production OTA rejects non-HTTPS URLs and validates the configured CA; no `setInsecure()` fallback remains in the canonical target.
- SHA-256, pinned asymmetric signature, strict `MSM261S4030H0` hardware target, `app` partition target, minimum protocol and upgrade-only strict SemVer checks are mandatory before activation.
- The signed canonical bytes are versioned and covered by golden fixtures. URL is intentionally excluded because signed download URLs may rotate; artifact identity remains bound by mandatory digest and signature.
- A/B OTA partitioning, rollback-enabled bootloader, 120-second boot-health confirmation and safe audio/network recovery are present in source. LAN ArduinoOTA remains development-only and disabled by default.
- Native Unity parser/state/signature tests passed 15/15. Normal and OTA firmware builds, embedded test compilation, partition/image metadata checks and diff/insecure-TLS/private-key scans passed.
- No physical board is attached. Flash/serial, I2S continuity, real secure WSS, command/OTA delivery, forced-failure rollback and post-reboot health confirmation remain `BLOCKED`.
- Production delivery also remains fail-closed until the real CA certificate and pinned public key are injected and the backend signs the exact canonical manifest bytes. Build proof is not provider, canary or hardware proof.

### 2026-07-14 — Real TOTP 2FA across backend, Web and Android

- Backend uses AES-256-GCM protected TOTP material, one-use recovery codes and a secondary token bound to the primary user/session. Missing or invalid 32-byte encryption configuration fails closed; SMS is explicitly unavailable.
- Demo primary login returns a bounded challenge without creating a session. API, Firebase and WebSocket protection require the bound second-factor token; replay, cross-user use, concurrent submit, challenge exhaustion/expiry and disable paths are covered.
- Independent backend security review found no remaining P0/P1 in the 2FA slice. Focused backend smoke passed 15/15; syntax, base, workspace, repository and appointment regressions passed independently.
- Shared HTTP/device contracts passed 10/10, including disabled-before-verification and bounded login challenge fixtures.
- Web Auth/account-security tests passed 24/24, Web contracts 14/14, full ESLint and production build passed. The real Chromium Auth sweep passed 126/126 with no serious/critical axe issue, console/static-asset error, overflow or undersized standalone action.
- Android credentials and OTP are modeled with immutable `UiState`, actions and one-shot effects. The App does not emit login success until backend challenge confirmation; the secondary token remains process memory only. Account 2FA enrollment, recovery acknowledgement, disable and session revoke also use backend-confirmed state.
- Full Android unit tests passed 70/70; `assembleDebug` and `lintDebug` passed with zero lint Error/Fatal findings. Emulator/device, TalkBack, process-death and real Firebase/FCM proof remain `BLOCKED` because no runtime target or credentials are attached.
- Nodemailer was upgraded to 9.0.3 and Firebase Admin to 14.1.0/Node 22 with a modular Auth/Messaging adapter and a dedicated compatibility smoke. `npm audit` is now 0 critical/high; six moderate transitive Google Cloud/UUID advisories remain tracked as P2 upstream risk.
- Live PostgreSQL migration/row-lock/transaction proof, Firebase protected API/WebSocket E2E and deployment remain `BLOCKED` without `DATABASE_URL`, Firebase credentials and production `TWO_FACTOR_ENCRYPTION_KEY`.

### 2026-07-14 to 2026-07-17 — Phase 3 account/profile/family/workspace hardening (source/local closed)

- Shcare Web account settings now keeps workspace authorization failures local to the workspace section instead of hiding the full account surface. Profile, avatar, password, preferences, workspace switching and session revocation no longer render success before the backend confirms the persisted outcome.
- Web session revoke now reuses one `Idempotency-Key` across retries and requires `revoked=true`, the matching session ID and `revokedAt` before success. Verification passed 31/31 Auth/account tests, 14/14 shared contract tests, TypeScript typecheck, full ESLint and production build. Final CSS is 59.70 KB gzip and self-hosted fonts total 82.57 KB. A new live provider mutation run is not claimed in this in-progress slice.
- Android Profile, Family and Workspace use feature ViewModels with immutable state, stable idempotency keys for retried mutations and backend-confirmed outcomes. Family data uses canonical DOB, blood type, allergies and emergency-contact fields; active profile and workspace context change only after matching server confirmation.
- Android load coverage distinguishes offline I/O from 401/403 permission denial for Profile, Family, Workspace and Account Security. Session revoke retries keep one idempotency key and the App does not render a revoked state until the backend returns the matching session with `revokedAt`.
- Pending registration PII is no longer stored as plaintext JSON. It uses Android Keystore AES-256-GCM with authenticated associated data, a versioned ciphertext envelope, legacy plaintext migration/removal and fail-closed writes; backup remains disabled/excluded for sensitive domains.
- Full Android `assembleDebug`, `testDebugUnitTest` and `lintDebug` passed: 108/108 tests across 19 suites, zero failure/error/skip, zero lint Error/Fatal and 38 non-blocking warnings.
- Emulator/device runtime, TalkBack, process-death Keystore behavior, real Firebase/FCM and live provider/database proof remain `BLOCKED`; source/build evidence does not substitute for those proof classes.
- The frozen backend snapshot closed the known P0/P1 identity findings with negative tests: production demo bearer denial, retry-safe first-login identity creation, Firebase UID-only conflict handling, canonical membership/session revocation across instances, SQL/WSS revocation, additive identity migrations, audit-actor retention, PHI-safe patient/share reconciliation and provider/backend deletion recovery.

### 2026-07-17 — Phase 3 backend identity, importer and managed-admin closure

- Managed-admin creation is now a durable three-stage saga: reserve a deterministic Firebase UID, persist the backend user as `provisioning_pending` with an unresolved `managed_admin_activate` identity operation, enable and strictly verify Firebase, then atomically activate the user and complete idempotency/audit state. A pending account cannot satisfy the last-platform-admin invariant or receive a tenant membership when it is a platform admin.
- Retry and race coverage proves that workspace renames do not change an idempotency fingerprint, response-lost Firebase creation is recovered by deterministic UID, completed replay never re-enables a later locked provider, create-versus-lock is serialized, and a PostgreSQL `COMMIT`-applied-then-connection-error is reconciled without disabling a canonical active administrator.
- JSON-to-PostgreSQL import now validates the complete graph before migration/data writes, rejects unapproved or inactive-workspace operational access, rejects cross-tenant notification audiences, preserves canonical tenant/principal identities, keeps revocation monotonic, and only updates patient PHI when the source `updatedAt` is strictly newer. Bundled `data/db.json` still requires explicit tenant remediation and is therefore reported `BLOCKED`, not silently imported.
- Runtime authorization now grants Portal capabilities/surfaces only from an active approved membership, excludes pending doctors from patient-share targets, validates doctor/workspace share authority in JSON and SQL transactions, and prevents a matching `userId` from bypassing notification tenant scope. Platform-admin notification visibility remains an explicit privileged exception.
- Integrated allowlist: 24/24 backend files matched the frozen snapshot SHA-256 after copy. Pre-integration originals and manifests are stored at `C:\Users\baobe\Documents\Codex\2026-07-13\lam\outputs\phase3-backup-20260717-043549`; no reset, stash, broad staging or unrelated file rewrite occurred.
- Integrated-repo gates passed: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:managed-admin-create` (17 focused provider/saga tests plus JSON/SQL and role-transition smokes), `smoke:identity-migrations`, `smoke:repositories`, `smoke:workspace-access`, `smoke:two-factor` (15/15), `smoke:firebase-admin-compat` (4/4), and `smoke:klt-contract`. `git diff --check -- smart-health-embedded/web-monitor` exited 0.
- Platform Admin CodeGraph remains local/untracked and healthy: 133 indexed files, 1,535 nodes and 3,053 edges.
- Closure level is source/build/local/simulated only. No `DATABASE_URL` or Firebase Admin credential was used for a real row-lock/migration/provider mutation run, no Android target is attached, and no release/deploy was performed. PostgreSQL/Firebase/provider, emulator/device and production promotion evidence remain `BLOCKED` and must be collected separately.

### 2026-07-17 — Phase 4 device provision/inventory source milestone (still in progress)

- Backend `provision-qr` now requires `Idempotency-Key`. JSON and PostgreSQL paths serialize the mutation, persist device + claim ledger + `device.provision` audit atomically, and replay a safe response without storing the raw one-time claim code. The claim code is deterministically reconstructed from the device verification material, operation key and request fingerprint.
- Device inventory metadata (`type`, `manufacturer`, `model`, `serialNumber`, `purchaseDate`) is now retained by the PostgreSQL upsert and JSON-to-PostgreSQL importer. Empty purchase dates become SQL `NULL`; migration `025_device_inventory_metadata.sql` is additive and no longer nests `BEGIN/COMMIT` inside the migration runner. Migration order remains `024_device_command_lifecycle.sql` then `025_device_inventory_metadata.sql`.
- Platform Admin Add Device now sends a stable idempotency key, blocks Escape/outside/X/footer dismissal while pending, keeps the one-time claim code in the dialog, and separates mutation success from list-refresh failure. Inventory fields are shown in the detail drawer and typed in the API contract.
- Fresh local evidence: backend device-security smoke `31/31`, `npm.cmd run check`, base smoke, repository/workspace/identity-migration/KLT contract smokes; Admin contracts `28/28`, TypeScript, ESLint and production client/SSR build. Firmware source/contract review and three PlatformIO ESP32-S3 builds passed; native tests could not execute because this host has no `gcc/g++`, and no board/serial target was detected.
- This is source/build/local/simulated proof only. Real PostgreSQL migration/row-lock execution, provider/live mutation, Admin/Web authenticated browser mutation, Android runtime, firmware WSS/I2S/OTA rollback and physical hardware proof remain `BLOCKED`.
- Phase 4 secure setup and telemetry continuation: firmware recovery AP now has factory-state/physical-gesture gating, random CSRF with constant-time validation, security headers, a ten-minute TTL and a working factory-reset handler in the station loop. It remains open Wi-Fi because the current QR/App/firmware contract has no per-device PoP/WPA2 secret.
- Firmware telemetry now reports uptime, reset reason, free heap, I2S health, packet sent/dropped/failure counters, last command outcome and OTA state. Backend allowlists and persists the snapshot through additive migration `026_device_telemetry.sql`; Web, Admin and Android expose the same optional contract.
- Fresh local evidence for this continuation: backend device-security `33/33`, Web lint/build, Admin contracts `28/28` plus typecheck/lint/build, Android compile/unit test, firmware production/development/OTA builds and embedded test-target compilation. `pio test -e native` remains blocked by missing `gcc/g++`; no board/serial/runtime/provider proof exists.
- Clarification: setup-AP physical gesture, expiry and CSRF are source-verified in this continuation; the remaining setup-AP gap is per-device PoP/WPA2 plus hardware runtime confirmation.
- Phase 4 remains open for secure setup AP physical gesture/PoP/expiry/CSRF, two-phase device-secret rotation, authoritative SQL claim hydration/update on pair/revoke, complete firmware telemetry/ACK/durable command dedupe, and native/hardware/provider proof. Do not promote this milestone to “complete”.

### 2026-07-18 — Phase 4 source/local closure with external proof retained

- Backend repository invariants now preserve the active credential until an exact confirmed rotation candidate is returned; mismatches are rejected. WSS and MQTT events are serialized per `deviceId`, closing the acknowledged/applying lost-transition race without weakening the lifecycle.
- Provisioning now has one canonical setup artifact across backend/Admin/Android: type/version, exact device and claim IDs, expiry, `Shcare-<12 hex>` setup SSID, `WPA2_PSK` and a 20-character PoP. Admin renders/copies/downloads the SVG QR and does not persist or reconstruct the one-time material after its lifecycle.
- Portal, Admin Activate and Android preserve identifier case, use stable intent-scoped idempotency and distinguish REST accepted from authenticated WSS online. Android parses the full typed pairing response and rejects identity/outcome/presence/transport/online drift.
- Admin OTA tracks pending/delivered/downloading/verifying/rebooting/confirmed/rolled-back/failed. A command applied event is not installation success; the matching OTA command, version and backend reconnect confirmation are all required.
- Independent local gates passed: backend 38/38 device security, 30/30 ownership repository, 3/3 setup security, 2/2 concurrency plus check/base/repository/workspace/identity/KLT smokes; Web 9/9 claim and 52/52 Auth plus lint/build; Admin 46/46 contracts plus TypeScript/lint/client+SSR build; Android 21/21 focused and 140/140 full unit plus compile/assemble/lint.
- Candidate source/build artifacts: Android debug APK SHA-256 `584946A4BC26F3432668D69F903A004AD3926163A57CE28C3A0E8695F0CFE58F`; firmware production `27EE44D3CC1C827318EE22C9565302848A3BB078DE7DA86EA25D440235DB6E80`; development `7175189ADC0A747212525EFC14465E728A6E233CBA9B1039D1A9CE71D8B2820F`; OTA-build profile `0F5C4D4A96182D2D1F2205D58C99880DFD91492C6B7AE68FF3CA4E58E7C7748B`.
- The production firmware was rebuilt after embedded-test compilation because the PlatformIO test target reuses and overwrites the production environment output. Embedded test compilation passed without execution; native execution failed because `gcc/g++` is absent.
- Source/local Phase 4 may hand off to Phase 5, but release remains blocked by live PostgreSQL/provider/browser proof, Android runtime, physical board/serial/I2S/WSS/OTA rollback, the 8 MB board-profile versus 16 MiB partition discrepancy, and seven high Admin dependency advisories including unpatched `xlsx`.

### 2026-07-18 — Phase 5 audit entry (no implementation claim)

- Portal review/alert/scan-detail query keys are not workspace-scoped and workspace switching does not clear those caches, creating a P0 stale-PHI exposure window. Live PCM has a metadata guard, but metrics/status are not session-bound or reset and browser frames lack sequence/timestamp/source identity. Admin AI still contains fixed animated waveform, fabricated timeline/model/doctor counts and an unsafe unknown-state → completed mapping.
- Backend device→server v2 source binding currently checks device/workspace/auth-session/scan identity and existing negatives should remain. The next server-side blockers are different: one global `activeRecording`, audio start/stop commands outside the command ledger, disconnect without scan interruption, duplicate-prone processing, blind chunk append and missing PostgreSQL audio protocol/session/drop metadata.
- Phase 5A acceptance order: workspace-scope PHI caches; persist scan + audio command before delivery; confirm recording only after ACK or first valid frame; interrupt the exact scan on socket/command failure; replace the singleton with a per-device/scan registry; then remove Admin AI fake states and implement review/alert ledgers.

### 2026-07-18 — Phase 5 source/local closure after independent P1 remediation

- The audited clinical-integrity gaps are closed at source/local level: Portal PHI query keys and workspace switching isolate review/alert/scan-detail state; WSS scan/audio state carries exact workspace/patient/device/scan identity; review decisions and alert acknowledge/resolve are real tenant-scoped, capability-checked, audited mutations; Admin and Android AI paths no longer seed or synthesize results.
- Seven upload/processing P1s were remediated: a reclaimable 15-minute completion lease with stale-token protection; durable generation/intent/artifact-fingerprint/run identity and SHA-256 queue IDs; orphan PCM cleanup plus safe exact replay after completion; deterministic atomic scan/audio/AI worker persistence; composite `(scanId, organizationId)` tenant scope; 1 MiB/chunk, 32 MiB/scan and 32,768-chunk guards across API/repository/import/DB; and terminal failure handling that cannot overwrite a newer processing generation.
- Reprocess now requires `Idempotency-Key`, serializes per scan, replays the same intent and creates a new durable generation only for a new key. JSON and PostgreSQL repository paths share the same rules; migrations `030`, `031` and `032` are additive. Bundled `data/db.json` remains fail-closed pending tenant remediation.
- Backend verification passed: `npm.cmd run check`, `npm.cmd test`, scan upload 15/15, API production smoke including 413/orphan cleanup, workspace access including reprocess replay, audio worker 6/6, clinical workflow 8/8, repositories, identity migrations, device security 41/41, audio protocol 4/4, AI chat 5/5, KLT contract, concurrency 2/2 and setup security 3/3. Backend diff check exited 0.
- Web verification passed: contracts 24/24, Auth 84/84, lint, TypeScript and Firebase build. CSS is 61.43 KB gzip and fonts total 82.57 KB. Chromium desktop/mobile checks found no horizontal overflow and verified public CTA, device copy and Auth behavior; the temporary browser session was finalized.
- Admin verification passed: contracts 59/59, lint, TypeScript and client/SSR Firebase build with 17 prerendered pages. Android passed 158/158 unit tests across 26 suites plus debug assemble, lint and debug-instrumentation compilation; APK SHA-256 is `E19F5D525AECB53295D56DCC99B62352D214A102A431AC41A5273E3BD0D4180B`.
- Closure class is source/build/local/simulated only. No production deployment occurred. Live PostgreSQL migration/locking, Redis worker, provider delivery/authenticated live mutation, Android runtime/TalkBack/FCM, and ESP32-S3 serial/I2S/secure-WSS/OTA rollback proof remain `BLOCKED`; Phase 4B external proof is still open.
- Phase 5 may hand off to Phase 6–7 for appointment/consent/notification/staff and remaining Admin operation truthfulness. Do not reopen these seven P1s without concrete regression evidence, and do not interpret this handoff as a release-complete claim.

### 2026-07-18 — Phase 6–7 consent, Admin settings and membership-authority closure

- Backend patient access now distinguishes `patient_consent`, `clinician_access_grant` and `administrative_assignment`, with purpose, canonical recipient, active/revoked/expired lifecycle, guardian boundary, idempotency and audit. Additive migration `036_patient_access_authority_type.sql` and OpenAPI describe the same contract.
- Portal and Android keep independent UI implementations while requiring the same canonical outcome. Web rejects malformed or mismatched create/revoke responses; Android uses a native repository/ViewModel/Compose state model and does not infer recipient, lifecycle or success from local state.
- Admin Settings now exposes mutations only for backend-persisted system, branding and webhook URL values. Provider/runtime state is read-only; backup, API-key, global policy, device-default and other unavailable controls no longer emit local-only success.
- Suspended memberships no longer count as active owners, receive workspace notifications, authorize account switching or patient mutation, retain direct scan/audio grants, expose paired devices, or remain eligible device owners. Owner transfer completion explicitly activates the replacement membership; stale JSON import cannot reactivate a canonical suspended membership.
- Integrated backend evidence passed `check`, base test, repository, identity-migration, workspace-access, device-ownership repository (32 tests) and KLT contract gates. Web passed 32/32 contracts plus TypeScript, ESLint and production client/SSR build. Admin passed 73/73 contracts plus TypeScript, ESLint and client/SSR build. Android passed 174/174 unit tests, Kotlin/AndroidTest compilation, lint and debug assemble; APK SHA-256 is `240D7AB72415BDCDA7C1CB33636A711B79E3BC0B0FA465989FBD6AA670952E6F`.
- This is source/build/local/simulated evidence only. Migration 036 on live PostgreSQL, authenticated Portal/Admin browser mutation, Firebase/provider delivery, Android emulator/TalkBack/FCM and physical-device proof remain `BLOCKED`; firmware impact is `N/A` for consent/settings and no firmware release is required.

### 2026-07-19 — Phase 6–7 package and storage operation closure

- Packages is canonical across Admin, JSON and PostgreSQL through migration 037. Create/update/archive requires Platform Admin authority and a stable `Idempotency-Key`; exact replay returns the first outcome, audit is transaction-bound and an assigned package cannot be archived.
- Storage is canonical across Admin, JSON, PostgreSQL and the importer through migration 038. Custom bucket create/delete and manual file upload/share/delete have transactional audit/idempotency; object upload is compensated on persistence failure and exact delete replay cannot delete the object twice.
- The Admin Storage surface now shows actual used bytes/files/workspace distribution only. It has loading/error/retry/empty states, failed-file-only retry and capability gates, and no synthetic quota, public/encrypted state, fake upload percentage, fabricated timeline or endpoint URL presented as a signed link.
- Signed sharing is honest: only an S3-backed HTTPS signed URL with a 900-second outcome is accepted. The local provider returns `STORAGE_SHARE_PROVIDER_UNAVAILABLE`, which the Admin displays as unavailable; direct authenticated download remains separate.
- Fresh local evidence: backend package `3/3`, storage `6/6`, check/base/repository/identity/workspace/KLT gates; OpenAPI 0.3.0 parsed with 45 paths; Admin `91/91`, TypeScript, ESLint and client/SSR build; scoped diff check exited 0.
- Closure remains source/build/local/simulated. Live migrations 037/038, S3 provider, authenticated browser mutation and deployment are `BLOCKED`; bundled JSON tenant remediation remains open. Android and firmware are `N/A` because these are platform-operation surfaces.

### 2026-07-19 — Phase 6–7 staff invitation and membership closure

- Direct staff creation was replaced by invitation list/create/resend/revoke/accept across JSON, PostgreSQL and additive migration 039. Mutations are tenant/capability scoped, idempotent and transaction-audited; raw acceptance tokens are never persisted and replay never re-discloses a one-time secret.
- Delivery truth is channel-specific (`ready|unavailable|sent|failed`). Admin and Portal expose independent UI layouts but the same six roles and lifecycle; neither reports email sent unless the provider accepted the recipient.
- Auth acceptance lives at `/staff-invitations/accept`, not Admin or Portal layout. Identity-only login/2FA/signup/email verification cannot authorize Portal; success requires an accepted invitation, active exact membership and authority refresh before navigation.
- Local evidence: backend staff `7/7` plus check/base/workspace/repository/identity/KLT/OpenAPI gates; Admin focused `12/12`, full `103/103`, type/lint/build; Web contracts `43/43`, Auth `91/91`, type/lint/build and 9-route-state Chromium checks with zero serious/critical axe or runtime/layout failures.
- This closure is source/build/local only. Live migration, provider email/inbox, authenticated production mutation and deploy remain `BLOCKED`. Android reuses only membership/workspace business state with its existing native UX; firmware is `N/A`.

### 2026-07-23 — Phase 6–7 Clinics/Workspace lifecycle closure

- Migration 040 and the JSON/PostgreSQL workspace lifecycle repository now own create/update/transition/archive, optimistic versioning, tombstones, idempotency and transaction-bound audit. Owner approval routes through this state machine; generic owner transfer requires the expected version, increments once and returns a replay-stable operation ID.
- Auth workspace request persists pending workspace plus owner request atomically. Legacy status backfill is compatible, while explicit archive tombstones remain authoritative across restart and public catalog/role-request hydration.
- Regression proof includes a same-database restart after archiving `org_default_clinic`, catalog exclusion before/after restart and denial of a doctor request targeting the archived ID. Backend gates passed check/test, lifecycle 7/7, workspace/repository/identity/KLT smokes; OpenAPI 3.0.3 parsed with 53 paths and 38 schemas.
- Admin Clinics validates exact receipts and exposes complete lifecycle/data states. Admin theme is independently implemented with shared brand tokens, pre-paint light/dark/system, system and cross-tab synchronization, themed toaster, reduced motion and 44 px controls. Web independently fixed its system-preference pre-paint regression.
- Admin passed 122/122 contracts, typecheck, lint, client/SSR build and 17-route Firebase build. The local authenticated Clinics smoke passed 27/27 route/viewport/theme checks with real backend data and zero blocking axe/runtime/request/layout findings. Web passed 94/94 Auth, 44/44 contracts, type/lint/build/Firebase build and 135/135 Auth browser checks.
- Closure class remains source/build/local. Live migration 040/PostgreSQL locking, provider credentials, preview/live mutation cleanup and deployment are `BLOCKED`; bundled JSON tenant remediation remains open. Android has no Platform-approval screen requirement and firmware is `N/A`.

### 2026-07-23 — Phase 6–7C notification campaign and delivery-truth closure

- Additive migration `041_notification_campaign_delivery.sql`, JSON/PostgreSQL repositories and the JSON importer now preserve campaign identity, audience type/role, requested channels and separate in-app, email and push delivery states. Campaign creation is recipient-scoped, limited to 200 active members, capability/tenant checked, transaction-audited and guarded by a required `Idempotency-Key`; exact replay returns the original outcome and a different payload is rejected.
- `GET /notifications/options` returns only authorized active workspaces, roles and users plus runtime truth for `in_app`, `email` and `push`. `POST /notifications` accepts `workspace|role|users` audiences and never treats backend acceptance as provider delivery. Email/push remain independent states. A regression discovered by browser QA was fixed so non-role audiences no longer inherit the default `viewer` role.
- Platform Admin uses a dedicated dense campaign composer, strict receipt parser, real provider availability, loading/offline/error/retry states and accessible 44 px actions. Browser QA also fixed undersized list controls, touch-only delete visibility, success-badge contrast and Sonner toast contrast without copying Web or Android layouts.
- Web and Android models consume the same per-channel delivery fields. Android deliberately does not expose Platform Admin campaign creation; its native notification UX remains separate. Firmware has no direct actor in campaign creation, so firmware impact is `N/A`.
- Fresh evidence: backend `check`, base test, workspace-access, repository, identity-migration, push and KLT smokes plus notification repository `5/5`; OpenAPI 3.0.3 parsed with 54 paths and 48 schemas. Admin passed `128/128` contracts, TypeScript, ESLint, client/SSR and Firebase builds. The self-starting authenticated Admin operations matrix passed `36/36` route/viewport/theme checks and one real recipient-scoped campaign with temporary-data cleanup, with zero serious/critical axe, console/request, overflow, theme/provider-state or sub-44 px failures.
- Web passed `94/94` Auth and `44/44` contracts plus lint and both builds. Android passed `176/176` unit tests across 30 suites, Kotlin compilation and debug assemble; APK SHA-256 is `59F946FE0D34FF132ADA24704BE967281013D2D8F8DD69D97A0AEADDB4652EB9`.
- Closure class is source/build/local only. Live migration 041/PostgreSQL transaction proof, Brevo/FCM provider delivery, authenticated preview/live mutation cleanup, Android runtime/notification-channel/deep-link proof and deployment remain `BLOCKED`. Bundled JSON tenant remediation remains open; no firmware release is required for this slice.

### 2026-07-23 — Phase 6–7D1 Overview data-truth and UI-state closure

- The Admin/Portal Overview backend no longer fabricates a 10/30/40/20 chart from the aggregate count. `today|7d|30d` now produces zero-filled buckets from real scan timestamps in the requested integer timezone offset; the bucket sum must equal the range-scoped scan KPI. Unsupported ranges fail with HTTP 400.
- Snapshot and range semantics are explicit through `generatedAt`, start/end, bucket and timezone metadata. Device and signal-processing slices use stable keys; clinic/workspace counts no longer force a minimum of one, and a workspace without context can no longer inherit every pending doctor request.
- Admin parses the response fail-closed before rendering. First-load failure shows only error/retry; refresh failure may retain the previous confirmed result with a stale warning. Fake zero fallback, hardcoded trend arrows, name-based online detection, fake minimum progress, synthetic recent-alert timeline and light-only chart colors were removed.
- The dashboard now has explicit loading, empty, stale, retry and range-refresh states, semantic light/dark chart tokens, reduced-motion behavior, 44 px actions and accessible chart summaries. Browser QA found and fixed signal-source contrast plus unnamed/focusable Recharts sectors.
- Evidence passed: overview contract `4/4`, workspace-access, backend check/base/repository smokes; OpenAPI 3.0.3 parsed with 56 paths and 53 schemas. Admin passed `135/135` contracts, TypeScript, ESLint, client/SSR and Firebase Admin builds. The authenticated operations browser matrix passed `45/45` route/viewport/theme checks with zero serious/critical axe, console/request, overflow, theme/provider drift or sub-44 px failures, while retaining the real temporary notification mutation and cleanup.
- Closure class is source/build/local. No database migration is required for this additive read contract. Live backend/Admin/Portal promotion and authenticated preview/live verification remain open; Android is `N/A` because its patient/doctor dashboards remain native actor-specific surfaces, and firmware is `N/A` because no device protocol changed.

### 2026-07-23 — Phase 6–7D2A Storage partial/stale-state closure

- The dormant aggregate fallback was removed after verifying that the existing full-error guard prevented it from appearing during the ordinary first-load failure path. The actual reproduced gap was `Promise.all`: either failed request discarded the other successful result, while a failed refresh also hid confirmed data.
- Stats and files now use independent `Promise.allSettled` outcomes plus strict read-model parsers. Partial success remains visible, stale confirmed state is labeled, missing data receives no replacement value, and upload fails closed without a confirmed bucket catalog. Devices uses the same parser for firmware inventory.
- Charts and controls now use semantic theme tokens, reduced motion, accessible summaries/labels and 44 px actions. Evidence passed: focused Storage `13/13`, full Admin `138/138`, TypeScript, ESLint, client/SSR build, Firebase Admin build, and authenticated browser `54/54` across 390/768/1440 and light/dark/system with zero blocking axe/runtime/request/overflow/theme/target findings.
- Closure is source/build/local only. Existing backend storage persistence/provider blockers remain unchanged; Android and firmware are `N/A`. Continue D2 with the next reproduced fake/dead-state or incomplete operation.

### 2026-07-23 — Phase 6–7D2B Patient CRUD identity and mutation closure

- Canonical patient identity is separated from the patient code across backend, Admin and Portal. Structured profile/contact/clinical fields replace notes-packed data; strict parsers and exact intent receipts fail closed on drift or duplicate IDs.
- Create/update/delete are capability and tenant scoped, transaction-audited and retry-safe. Optional delete idempotency preserves old clients, while keyed replay survives the soft-delete lookup boundary. JSON mutations are serialized and rollback their snapshot on persistence failure.
- Admin and Portal retain independent UX with loading/empty/error/retry/offline/stale/permission/unsaved/destructive states. Browser evidence passed Admin `63` route/viewport/theme checks plus real CRUD/cleanup and Portal Patients `9` viewport/theme checks plus exact idempotent replay/cleanup; zero blocking axe, console/request, overflow, theme or 44 px findings remained.
- Integrated evidence passed: backend check/base/repositories/workspace/KLT; Admin `146/146`, type/lint/client+SSR/Firebase builds; Web `53/53` contracts, `96/96` Auth/UI tests, type/lint/client+SSR/Firebase builds; Android family-profile focused tests and full debug unit/build gate.
- Closure is source/build/local/browser only. Live deployment, PostgreSQL/provider and Android runtime proof remain open; firmware is `N/A`. D2C must replace the legacy per-row import with a true expiring `validate → preview → commit` batch contract before Patient Import can close.

### 2026-07-23 — Phase 6–7D2C Patient CSV Import atomic-batch closure

- Backend now owns UTF-8/5 MiB/5,000-row parsing, structured validation, within-file/workspace duplicate detection, 24-hour batch expiry and the tenant/capability boundary. Additive migration 042 and both repository modes preserve the same batch lifecycle; validation creates no patient and commit is all-or-nothing with audit and required idempotency.
- JSON repository regressions prove one outcome under concurrent exact validation/commit retry, snapshot rollback on persistence failure, expiry denial and no partial rows after a post-preview duplicate. Workspace HTTP smoke adds personal/viewer and cross-tenant denial, invalid-batch no-op, key-reuse mismatch, exact replay and cleanup.
- Portal uses its own responsive workflow and canonical primitives with every required data state, 50-row pagination and unsaved/destructive guards. Browser proof passed 18 Patients/Import viewport-theme checks and a real validate/commit/replay/cleanup journey; the run caught and fixed one action-label contrast regression.
- Integrated evidence: import `8/8`; backend check/base/repositories/workspace/identity/KLT; OpenAPI `59/59`; Web `57/57` contracts, `97/97` Auth/UI, type/lint/client+SSR/Firebase builds and browser `18`. Closure is source/local only until migration 042 and transaction locking are exercised on candidate PostgreSQL and preview/live promotion is proven. Android and firmware are `N/A` by actor/surface.

### 2026-07-23 — Phase 6–7D2D Audit/Export security, scope and artifact closure

- `/api/v1/audit-logs` is the canonical append-only audit ledger. `/api/v1/access-logs` and `/api/v1/portal/audit-log` are compatibility aliases over the same validated server-side query, action, resource, actor, date, sort and pagination contract; the legacy access-log projection is no longer treated as audit truth.
- Audit metadata is recursively redacted before repository persistence. PostgreSQL append-only protection remains active and JSON fallback exposes append-only event creation without an edit/delete path.
- Additive migration 043 stores export dataset, scope, filters, renderer version and SHA-256. Renderer `shcare.export-artifact.v1` produces real immutable JSON, UTF-8 CSV, OpenXML XLSX and PDF artifacts from the frozen backend snapshot.
- Capabilities and scope are fail-closed: Platform Admin may export the platform-global audit ledger; workspace owner/admin is limited to the active workspace; doctor clinical exports include only actively granted patients; patient exports include only owned/dependent profiles; billing and viewer are denied. Limited actors list/download only their own jobs and cannot cross tenant or reach platform-global artifacts.
- `Idempotency-Key` binds export intent. Exact replay returns the first job and does not append another `export.create` event; every successful download is audited separately. The workspace regression grants one patient to a doctor, proves the scoped artifact, revokes the grant and proves the post-revoke export cannot retain that data.
- Bundled JSON tenant mismatch and dangling owner were corrected with explicit `migration.patient_tenant_remediated` and `migration.patient_owner_reference_cleared` audit events. The identity-migration gate now accepts the bundled database; older notes marking this dataset as the current blocker are retained only as history.
- Backend verification passed `check:audit-export`, focused audit/export `12/12`, repositories, identity migrations, workspace access, `npm.cmd test`, KLT contract and OpenAPI `0.4.0` validation.
- Platform Admin passed TypeScript, ESLint, `151/151` contracts and the Vite build (`3079` modules; CSS `122.28 KB`, `19.02 KB` gzip). Browser proof passed `72/72` checks at 390/768/1440 and light/dark/system with zero serious/critical axe, console/request, overflow/theme or sub-44 px failure; it verified real server audit filters/metadata and a platform CSV Blob through SHA-256, `Content-Disposition`, UTF-8 BOM and cleanup.
- Admin production dependency audit reports 17 advisories (2 low, 7 moderate, 8 high, 0 critical). The unused vulnerable `xlsx` path and its advisories are removed; remaining toolchain advisories stay in the release ledger.
- Portal passed focused audit/export `8/8`, full Vitest `29` files/`105` tests, contracts `60/60`, TypeScript, ESLint, targeted diff check and Firebase build (`2391` modules; CSS `403.87 KB`, `62.64 KB` gzip). Scope/workspace/renderer/hash binding fails closed and Portal never accepts a platform export.
- Isolated browser evidence loaded 147 audit rows, reduced `q=scan` to 11 server-filtered rows, downloaded 11 CSV rows with SHA prefix `4e031d2e6faa`, then observed 149 ledger rows including the create/download audit pair. Reports showed real 1 patient/2 devices/2 scans/0 abnormal; desktop/mobile 390×844, light/dark/reduced-motion, targeted console/overflow, cards and 44 px checks passed. Backend, ports 3100/8080, temporary data and credentials were cleaned.
- The complete Portal route smoke remains unproven. After obsolete Radix/appointment harness selectors were fixed, its third rerun stopped on dev-server timeout/`ERR_CONNECTION_REFUSED` before a product assertion. Record this as a harness/runtime proof gap, not as a green matrix or product regression. Portal `bun audit` currently reports 5 advisories (1 high, 3 moderate, 1 low).
- Closure remains source/build/local. Migration 043 on live PostgreSQL, provider/live queries, authenticated preview/live artifact checks, client promotion, deploy IDs and cleanup evidence remain open. Android workspace/platform audit UI is `N/A`; personal export/access-history is a separate native Settings/Security slice. Firmware is `N/A`.

### 2026-07-23 — Phase 8B Portal route proof and 8C candidate preparation

- The previously open complete Portal route smoke is now green on an isolated
  local Web/backend pair. Harness drift was corrected for native Radix controls,
  capability-derived routes, the explicit unavailable 2FA state and truthful
  direct-URL denial. The run returned `ok: true` with no accumulated HTTP
  failure, request failure or severe console error.
- Product defects found by the smoke were fixed before the green rerun: the
  seeded demo doctor now has an operational Portal membership; avatar audit,
  notification, settings and workspace navigation use the canonical
  `RouteContract`; appointment managers without staff-management permission no
  longer fetch the staff ledger and a doctor is truthfully self-assigned.
- Final Portal gates are `105/105` Auth/UI tests, `63/63` contracts, TypeScript,
  ESLint and Firebase build (`2392` modules; CSS `62.60 KB` gzip). Backend
  `check` and base smoke pass. Portal dependency overrides move Vite to
  `7.3.6` and pin patched TanStack server-core, brace-expansion, protobufjs and
  esbuild versions; `bun audit` now reports no vulnerabilities and all Portal
  gates pass again after the lockfile change.
- Platform Admin moved its Cloudflare Vite plugin to `devDependencies`.
  `npm audit --omit=dev` is now `1 low`, `0 high`, `0 critical`; the one
  Windows development-server esbuild advisory and the development-only
  Cloudflare/miniflare/sharp chain remain explicitly tracked without being
  described as production runtime code.
- Fresh cross-surface candidate builds pass: Admin contracts/build; Android
  `176/176`, debug assemble and lint with zero Fatal/Error; brand `5/5`;
  shared contracts `11/11`; and three PlatformIO firmware profiles.
- Candidate versions are Android `1.0.0-rc.1`/code `2` and firmware `1.0.0`.
  Artifact hashes, compatibility and deploy/rollback order are recorded in
  `SMART_HEALTH_RELEASE_CANDIDATE_MANIFEST.md`.
- This closes the former local Portal route-proof gap only. Candidate/live
  PostgreSQL, Firebase/Render/provider, Android production signing/runtime and
  physical ESP32-S3 flash/I2S/WSS/OTA rollback remain `BLOCKED`.

### 2026-07-23 — Phase 8C clean source candidate closure

- The intentional source candidate is
  `3beac9604f2a2381697e58a5278502b6f7c5ca0e`. Its baseline diff contains
  `512` files, `0` paths outside the release allowlist, `0` credential/secret
  paths, `0` high-confidence credential findings and no diff-check failure.
- Windows checkout reproducibility is explicit: root `.gitattributes` pins
  source and module scripts to LF, backend smoke owns a temporary canonical
  seed, and Android ignores local Kotlin compiler sessions. These fixes were
  discovered by detached clean-worktree verification rather than hidden by the
  long-lived development tree.
- Exact-source backend/package gates pass; exact-source Admin passes
  `151/151`, type, lint and client/SSR build. The unchanged Web tree passes
  frozen install/audit, `105/105`, `63/63`, type/lint/build. Android passes
  `176/176`, assemble and lint; all three firmware profiles build.
- The release manifest owns the clean artifact hashes and compatibility
  verdict. Provider/live database, Android runtime/signing and physical-board
  proof remain separate `BLOCKED` rows; no preview or production deployment
  was performed in Phase 8C.
