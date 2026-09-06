# Shcare rebuild execution ledger

## 2026-09-05 - Exact dual-microphone channel mapping

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| MSM261S4030H0 wiring contract | Source/docs PASS | Datasheet polarity and ESP32-S3 stereo ordering are now explicit: `slot 0 = Left = L/R to GND`; `slot 1 = Right = L/R to 3.3 V`. Both capsules share `SCK=GPIO11`, `WS=GPIO12`, `SD=GPIO10`, common GND and 3.3 V; CHIPEN must be high. Physical enclosure position is not inferred from the channel name. |
| Firmware regression | PASS, not flashed | Named slot constants are covered by the dual-mic source/golden contract and the production target builds successfully. The generic build was not flashed over the enrolled device. |
| Physical dual-mic gate | PHYSICAL BLOCKED | Fresh bounded COM9 data still shows Left/slot-0 RMS `1,325-39,455`, while Right/slot-1 RMS is only `22-56`. Power down, repair/check the Right capsule's 3.3 V, GND, CHIPEN, SEL, shared clocks/data and acoustic path, then rerun the per-capsule tap test. |

## 2026-09-05 - Production telemetry and WSS-only runtime

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| ESP network telemetry | Production PASS | Strictly sanitized Wi-Fi/IP/RSSI now survives PostgreSQL reload and keeps top-level API fields identical to nested telemetry. Firmware reports the live association. Device security `90/90`, repository and firmware contracts/builds pass. |
| Render transport runtime | Production PASS | Deploy `dep-dadu35ss728c73fhrns0` is live at `git-61971072530b`. Production logs expose canonical HTTPS/WSS only; UDP fallback is disabled and not bound. Release-runtime `6/6`, release-security `5/5`, KLT contract and aggregate backend pass. |
| Live device projection | Authenticated production PASS | The enrolled device is online over WSS; Supabase and authenticated API both have current Wi-Fi/IP/RSSI, with exact top-level/nested parity. This closes Admin's previous online-but-missing-network display inconsistency. |
| Physical/accessibility/provider closure | PARTIAL | Xiaomi is attached/awake and COM9 is present. Spoken TalkBack is still disabled by MIUI policy; mic slot 1 is near silence; approved signed OTA/forced rollback and external AI provider canary remain required. |

## 2026-09-05 - Migration 060 and physical records follow-up

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| Supabase trigger hardening | Production PASS | Four mutable-`search_path` warnings are removed with invoker functions and qualified relations. Hostile-path dynamic trigger regression passes with rollback cleanup; fresh Advisor reports `0` WARN/ERROR and `46` INFO. |
| Render promotion | Production PASS | Pooler-owner conflict and invalid `pg_catalog.coalesce` were reproduced and fixed. Deploy `dep-dadtdhvavr4c73an61hg` is live at `git-6e203301e599`; public smoke and release-security `5/5` pass with no deploy-window error log. |
| Android records surface | Source/build/physical Compose PASS | Records unit/build/lint pass. APK `71774EA6...7A54CE` is installed; Xiaomi test `1/1` proves the share picker is compact by default and opens at 200% font/dark theme through a 48dp target. Real TalkBack speech remains blocked because MIUI denies ADB secure-setting control. |
| Two-microphone acceptance | PHYSICAL BLOCKED | COM9 WSS counter advances and slot 0 is healthy, but slot 1 remains RMS `70–110`. Repair SEL/wiring/power/capsule/acoustic hardware before two-mic acceptance; do not flash the enrolled image or amplify noise blindly. |

## 2026-08-26 - G3 direct dual-band ESPTouch correction

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| Android transport | Source + focused test + lint PASS | Removed the MIUI-rejected `WifiNetworkSpecifier`/network-binding handover. ESPTouch V2 remains on the existing router connection, selects a visible same-SSID 2.4 GHz BSSID for the ESP target, and has no chooser, BLE, SoftAP, browser, or IP path. |
| Android package | Xiaomi install PASS | Full `:app:testDebugUnitTest` is `857/857`; `:app:lintDebug`, `:app:assembleLocalDemoDebug`, and `:app:assembleDebugAndroidTest` pass. APK SHA-256 `7A1C18FBFC77846CBFA2FE4B612D5F6A988ADB0826B43B4C020CD40A1E9A38C0` installed successfully with local API/Auth reverse mappings. |
| Physical Broadcast and downstream | OPEN, not passed | A guarded fake-credential broadcaster HIL could not read the current SSID while MIUI kept the instrumentation surface backgrounded; it sent no real credential. COM9 is absent. Resume only with secure on-device input plus serial listener → DHCP → WSS/ACK/audio/scan/OTA rollback evidence. |

## 2026-08-26 - G3 ESPTouch V2 dual-band router correction

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| Android router selection | Source, test and lint PASS | Xiaomi scan confirmed a common SSID with 5 GHz and a separate 2.4 GHz BSSID. Android now requests the exact 2.4 GHz BSSID through `WifiNetworkSpecifier`, binds only the ESPTouch broadcast window, and releases it after broadcast. There is no BLE, ESP SoftAP, browser/IP or Settings path. |
| Android package | Xiaomi install PASS | `:app:testDebugUnitTest` focused tests (37), `:app:lintDebug` and `:app:assembleLocalDemoDebug` passed. The merged manifest has no Bluetooth/nearby-device permission. APK `30002978605139CA73B8618479DE72CBF2DFBC32E8DF7A9228A83A8EB3696C5D` installed successfully. |
| End-to-end provisioning | OPEN, not passed | Phone lock prevented a final visual cold-start check and was not bypassed. Resume only through the secure password field and any normal Android confirmation; then collect ESPTouch listener, DHCP, WSS, ACK, audio-v2, durable scan, signed OTA and rollback proof. |

## 2026-08-26 - G3 ESPTouch V2 hardware deployment

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| COM9 firmware | Physical deployment PASS | Normal ESP32-S3 image `623072C1A59C05312F318712A99E0570806DBCE1814A7E637236C0C89516B647` uploaded to ESP32-S3 rev 0.2; OTA counterpart is `AFAA53C90A3B5F0C13AA8470500AE91FA6AC7ECCF042EF6ACD3EE763F3CFE806`. Every uploader write reported verified. Post-reset serial confirms the KDF golden-vector self-test, `ESPTouch V2 listener opened`, and active audio capture. |
| Xiaomi APK | Physical deployment PASS | LAN debug APK `CB018EE8815FD0222D8B261B9A34820AE878083298ED01FC471A27C981A4F62C` installed successfully. |
| End-to-end provisioning | BLOCKED, not failed | The secure UI cannot be reached while MIUI keyguard is locked. Do not inject the real Wi-Fi password via tooling. Resume only after unlock, then gather Broadcast, DHCP, WSS, ACK, audio-v2, durable scan and OTA rollback evidence. |

## 2026-08-26 - G3 ESPTouch V2 AES-128 transport cutover

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| Backend setup-session | Source + focused security PASS | Returns protocol 2 / `esptouch_v2` with derived AES-128 key and 17-byte Device-ID binding; tenant DeviceManage, `no-store`, upgrade rejection and throttle are tested in device security `83/83`. |
| Android broadcaster | Source + focused unit PASS | Official ESPTouch V2 builder receives API-provided key/binding and the six-step UI trace removes temporary ESP Wi-Fi/local API wording. Main/test Kotlin compilation and `DeviceSmartConfigV2ContractTest` pass. |
| Firmware listener | Source + normal build PASS | ESP32-S3 normal build passes with non-blocking V2 listener, binding rejection and deferred credential persistence. OTA build, COM9 flash/hash and real association/WSS remain pending. |

## 2026-08-26 - G3 Wi-Fi permission-overlay repair and hardware alignment

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| G3 Device Management -> Wi-Fi | Physical password-boundary PASS | Wi-Fi now opens direct SSID/password input; current-SSID permission is deferred to the explicit helper. Android full unit `856/856`, lint `0` errors / `3` warnings, Xiaomi `PhysicalDeviceProvisioningHilTest` `OK (1 test)`, backend check, device security `83/83`, and setup security `3/3` pass. LAN APK `00BC681014D3A0CBB73DC6575B1621B9A64A75491359480447A5AF32231EFA3F` is installed. |
| G3 ESP image | Physical flash PASS | COM9 read-only identity confirms ESP32-S3 rev 0.2 with 16 MB flash and 8 MB PSRAM. The current normal image (`1,141,872` bytes; SHA-256 `1671FDE1C44155BA6514549B33F0CB0042918E6894C5B13EA3A06646E3B7D29B`) was uploaded with verified writes and reset. Target Wi-Fi association, WSS/auth, ACK, audio-v2, durable scan, signed OTA and rollback remain unproven. |

Updated: 2026-08-26

## 2026-08-25 — G3 Xiaomi QR/manual claim and SSID HIL

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| G3 Android claim and Wi-Fi prefill | Physical partial proof | `PhysicalDeviceBleClaimHilTest` passed `1/1`; `CurrentWifiSsidHilTest` passed `1/1`. Focused `DevicePairingViewModelTest` + `DeviceBleProvisioningContractTest` are `38/38`; LAN debug and AndroidTest APKs rebuild/install. The HIL test now recognizes the existing safe permission/session state instead of falsely waiting out. Nearby Bluetooth is still denied, so obtain ordinary user permission and then prove BLE encrypted write → ESP Wi-Fi association → authenticated WSS/ACK/audio-v2/durable scan/OTA. |
| G3 firmware identity drift | Source/build + physical read-only proof | Production ESP32-S3 build passes at `1,311,397 / 6,291,456` application-slot bytes. COM9 read-only `flash_id` confirms ESP32-S3 rev v0.2, BLE and `16 MB` hardware flash; the checked 16-MB dual-OTA partition table remains valid. No firmware write occurred. |

## 2026-08-25 — G3 Android QR gallery slice

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| G3 Android pairing input | Source/build complete; physical UI proof blocked | Added system photo picker plus local QR-only decoder, 10 MB limit and no-backend-on-decode-error behavior. Fresh pairing JVM `33/33`, AndroidTest compile/assemble, lint and debug assemble pass; aggregate JVM `852/852` is retained. LAN artifact `897775F474DB1EC306DED901B9985FC6234860851279322C73944898A558D34F` is installed on Xiaomi; unlock/keep awake to run visual picker proof, then continue target Wi-Fi → WSS/ACK/audio-v2/durable scan. |

This ledger turns the accepted Shcare Web, Portal, Platform Admin, Android, backend and MSM261S4030H0 firmware plan into verifiable slices. It is an execution record, not a completion claim.

## 2026-08-15 Phase 3 exit and Phase 4 entry checkpoint

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| Phase 0–2 | Complete | Preserve recorded proof; no redo without a reproduced regression. |
| Phase 3 | Complete | Avatar `62/62`, Auth `396/396`, Web contracts `121/121`, backend Avatar `22/22` + API, 2FA `35/35`, aggregate build/gates and independent P0/P1 PASS. |
| Phase 4 | In progress | Candidate gates are green, but cross-surface review reopened five P1 software blockers; remediate and re-review before any closure. |
| Phase 5–8 | Pending | Advance only after the active software gate; external proof remains separate. |

The governing plan is **“Kế hoạch tái thiết toàn diện Shcare Web, Portal,
Platform Admin, Android và firmware”**. Deep Security is untouched at
`running/preflight`. Provider/live is `BLOCKED`; HIL is
`DEFERRED — chờ phần cứng`.

### Phase 4 candidate evidence and active remediation

| Surface | Current source/build/local evidence |
| --- | --- |
| Shared/backend | Shared `44/44`; backend `check` and device-security `42/42`. |
| Web/Portal | Contracts `122/122`, claim `10/10`, device-route subset `8/8`. |
| Platform Admin | Contracts `183/183`. |
| Android | `108` suites / `781` tests, devices `48/48`, main and AndroidTest compile, lint and assemble; APK SHA-256 `F32C7C3A85E40A217ACC8AEEC2DDF6DD0DA6694FA69B53BC4AF94263DD6828FE`. |
| Firmware | Source-contract PASS; MCU compile-only PASS with `0` executed; normal and OTA images each `1,104,640` bytes, SHA-256 `CB2B0A8749697FEEB14F4720E64A0CF8629109CDF6377784B7DB7F6CB2BAA7B5` and `CA79DE814DAC8D6BB3A48EB87F80E6ADDF331C62009129C013C250F30A074801`. Independent four-blocker re-review found no remaining software blocker in that scope; earlier firmware hashes are superseded. |

Cross-surface review reopened these five P1 software blockers:

1. Generic Admin command must exclude specialized revoke/rotate/OTA/audio
   lifecycle types.
2. SQL pair must share the ownership lock and current row.
3. Pair contract, Portal and Android must require exact active workspace and
   verify receipt/poll authority.
4. Admin revoke must use a stable `Idempotency-Key`.
5. Shared/OpenAPI must define command/revoke/rotate/OTA contracts.

This candidate is non-final. Native C++ execution is unavailable because this
host has no `gcc/g++` or equivalent compiler. Flash, serial, I2S, authenticated
WSS, rollback and physical 16 MB validation remain
`DEFERRED — chờ phần cứng`; they do not defer the five software remediations.

## 2026-08-09 Phase transition checkpoint (historical)

| Plan row | State | Current proof / next action |
| --- | --- | --- |
| Phase 0 | Complete | Preservation, baseline and canonical worktree remain valid. |
| Phase 1 | Complete | Versioned contract/security foundation remains closed; no regression reproduced. |
| Phase 2 | Complete at source/build/local | Web `121/121` contracts + `309/309` Auth/component; CSS `0` important and `60.58 kB gzip`; cross-engine browser matrices pass; Android `682/682`, lint `0/0`, compile/assemble pass; Admin `185/185`, lint/build and representative browser proof pass. |
| Phase 3 | In progress | Implement Forgot Password architecture, Family CRUD exact receipts and Workspace Settings atomic/idempotent mutation; then 2FA response-loss, avatar cleanup, inactive-account ordering, profile stable key, phone/Biometric and OpenAPI parity. |
| Phase 4–8 | Pending | Do not relabel internal slices as overall phases. Hardware-only proof may remain deferred, but software work continues. |

External proof remains explicit: Firebase/provider/emulator/live performance is
`BLOCKED`; firmware/HIL is `DEFERRED — chờ phần cứng`. No completion claim is
derived from those missing environments.

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

### 2026-07-26 — Master-plan Phase 2 Android authority foundation checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Overall progress is still **Phase 2 — two independent UI foundations**, not an internal `8E-*` checkpoint and not Phase 8 release completion. The older Phase 8B/8C entries above are historical RC evidence and do not override the current master-plan phase.
- Android protected navigation now uses a typed route/capability contract backed only by backend-confirmed account, Firebase identity binding, active membership, workspace, role and capabilities. Backend `userId` and Firebase UID remain separate identity namespaces; locked/deleted accounts, suspended memberships, missing identity binding and stale direct routes fail closed.
- Foreground, retained-destination TTL and configuration replacement gate protected Compose content before authority refresh. A cancelled in-flight refresh leaves a fail-closed lock for the replacement coordinator; a response can apply only to the exact authority epoch and the same API auth-session epoch before and after commit. Atomic compare-and-clear prevents an old refresh from erasing a replacement login/workspace authority.
- HTTP 401 and terminal account/workspace codes are request-token-epoch bound. Terminal invalidations use a bounded process-owned queue whose unacknowledged head survives collector replacement and overflow until teardown/navigation ACK. Account-terminal outcomes close notifications, invalidate push ownership, sign out Firebase and clear API auth; workspace-terminal outcomes close the notification session without fabricating a full account logout.
- Missing reauthorization runtime now fails closed to startup. Protected content has first-frame, active TTL, reauthorization, permission and stale-back-stack coverage; a retained destination cannot keep PHI composed indefinitely after its 30-second authority TTL.
- Fresh source/build/emulator evidence: `279/279` JVM unit tests across `43` suites, `25/25` connected instrumentation tests on `Shcare_RC2_API35(AVD)` / Android 15, `assembleDebug`, focused Kotlin/AndroidTest compilation and `git diff --check` pass. Debug APK: `24,841,196` bytes, SHA-256 `367D9A2E17AAF05839510196F8FB699165A5A0882F5518952E306EF5279D91A7`.
- This proves source/build and the covered emulator behavior only. The build explicitly had no `google-services.json`; real Firebase/FCM/provider delivery, authenticated live backend/PostgreSQL behavior, TalkBack manual pass, physical Android device and ESP32-S3/HIL proof remain `BLOCKED`. No production deployment or firmware release occurred.
- Continue Phase 2 with the independent native `ShcareScaffold`, compact bottom navigation, tablet/foldable navigation rail and adaptive UI/state foundation. Do not copy Web layout/components into Compose and do not advance the global phase until the Web and Android foundation acceptance matrix is actually complete.

### 2026-07-27 — Master-plan Phase 2 adaptive scaffold and notification-boundary checkpoint

- The governing plan is still **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the global status remains **Phase 2 in progress**. This checkpoint supplements the plan; it is not a replacement `8E-*` phase.
- Android now has its independent native `ShcareScaffold`: compact patient navigation uses Overview/Measure/Records/Account, sufficiently wide layouts use a navigation rail, and protected primary destinations remain authority/capability/epoch gated. Clinical navigation does not expose placeholder Patients/Alerts destinations before their real backend-backed screens exist. Motion uses short native fade/slide transitions without Web choreography or scale effects.
- Notification registration is bound to backend-derived user, canonical workspace and current auth session. ACK validation checks the exact token owner, workspace, session, protocol and app version. Workspace replacement and logout close the encrypted delivery gate and clear posted notifications before identity teardown; signed exported intents remain owner/workspace/generation bound.
- FCM protocol v2 is now a **data-only generic wake-up**. The backend sends no provider title/body, PHI/entity identifier or deep link, so background delivery cannot bypass Android's encrypted owner/workspace gate. Android rejects missing/unsupported protocol and conflicting `workspaceId`/`organizationId`, ignores provider clinical copy and opens only its authenticated inbox.
- Backend migration `044_notification_device_workspace_binding.sql`, repository eligibility and retry logic recheck active account, membership, token ownership and auth-session state. Retry keeps device IDs rather than stale raw tokens. The shared HTTP contract deliberately keeps `authSessionId` and app version in registration/ACK only, not in the FCM provider envelope.
- Fresh local evidence: shared contracts `14/14`; backend `check`, base test, repository and workspace smokes; Firebase Admin compatibility `4/4`; notification push `9/9`, including backend-to-shared-schema parity; `npm audit` reports `0` vulnerabilities after the compatible `google-gax@5.0.4` override. Android passes `304/304` JVM tests across `48` suites, `lintDebug` with `0` Fatal/Error (`40` warnings, `6` informational hints), debug assemble and `33/33` connected tests on `Shcare_RC2_API35(AVD)` / Android 15.
- Debug APK: `24,842,110` bytes, SHA-256 `DFCD7DF38E4C40C8D6A8ABC78C4E874885006FE3187E612236D13EF2ADC0BE18`.
- This remains source/build/local/emulator proof. `google-services.json` is absent, so real FCM/provider delivery is `BLOCKED`; live PostgreSQL migration `044`, production signing, physical Android device, manual TalkBack/system-animation pass, firmware HIL and live promotion also remain `BLOCKED`.
- Phase 2 is not complete. Remaining foundation work includes real clinical Patients/Alerts routes, complete light/dark token migration, 840 dp two-pane/foldable behavior, 412 dp/golden coverage, full IME/edge-to-edge proof, font-200%/TalkBack runtime proof and the remaining Web/Admin UI-foundation acceptance matrix.
- Durable Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains running at preflight. Its required worker/skill preflight is not ready, so no scan goal, worker artifact, completion or failure was fabricated.

### 2026-07-27 — Master-plan Phase 2 primary-screen semantic theme checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and overall status remains **Phase 2 in progress**.
- Android's native semantic palette now owns light/dark brand-header roles in addition to status roles. The doctor dashboard, patient dashboard, Settings, Medical Records and New Scan canonical Compose surfaces now resolve background, surface, border, text, action and status colors through `MaterialTheme`/`ShcareTheme`; they no longer contain `Color.White`, inline hex colors or the legacy light-only palette.
- Brand headers keep an Android-specific restrained signal gradient with distinct light/dark colors and an explicit on-brand role. Web tokens/components/layouts were not imported into Compose.
- A JVM source contract prevents the five migrated screens from reintroducing light-only literals or legacy tokens. Two API-35 instrumentation tests resolve and assert the actual light/dark Material and Shcare semantic colors at runtime while rendering shared Settings/filter components.
- Fresh proof: `307/307` JVM tests across `49` suites; `lintDebug` has `0` Fatal/Error, `40` warnings and `6` hints; debug assemble passes; `35/35` connected tests pass on `Shcare_RC2_API35(AVD)` / Android 15. `git diff --check` passes.
- Debug APK: `24,849,877` bytes, SHA-256 `46E57E83EB500E379F34CF695C98C5FDFB4F00A8B6EC7223921E0C4BF168C25B`.
- Phase 2 is not complete. Remaining Android foundation work includes semantic migration of the remaining production screens, real clinical Patients/Alerts destinations, 412/600/840 dp golden and two-pane/foldable proof, IME/edge-to-edge, font-200%, manual TalkBack and system Remove Animations checks. Real Firebase/FCM, production signing, physical-device, live backend/PostgreSQL and firmware HIL gates remain separately `BLOCKED`.

### 2026-07-27 — Master-plan Phase 2 Android Auth and approval-state checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the global status remains **Phase 2 in progress**.
- Signup now uses Android-native semantic roles, system/IME insets, field-level validation, retryable catalog state, an unsaved-change guard and exact password input without trimming. It no longer hardcodes a fake app version or light-only palette.
- Email verification keeps the real authenticated email-link flow. The unused manual OTP screen and fake phone/contact verification success paths were removed; unavailable provider flows now say so truthfully. Contact PII is no longer encoded into the `re-verify` navigation route or back stack.
- The doctor approval screen now uses a centered adaptive `LazyColumn`, light/dark Material/Shcare roles, polite/assertive TalkBack live regions, headings, 48 dp actions, catalog retry, field errors and an unsaved-change confirmation. Provider branding was removed from user copy.
- Doctor resubmission no longer calls `PATCH /me` before `POST /auth/role-request`. The role-request endpoint already persists the complete doctor profile, so the App now performs one backend mutation and accepts success only when the response belongs to the current user and returns a recognized doctor-request lifecycle.
- Regression proof: `315/315` JVM tests across `50` suites, `assembleDebug`, lint with `0` Fatal/Error and `40` warnings, `35/35` connected tests on `Shcare_RC2_API35(AVD)` / Android 15, and a clean repository `git diff --check`.
- Debug APK: `24,855,877` bytes, SHA-256 `061FB2B1419514A258957A2FF950DA13E23679131039372601A5B909E91304F1`.
- This remains source/build/emulator proof. `google-services.json` is absent; real email/FCM provider behavior, manual TalkBack/font/IME/golden QA, physical-device, live PostgreSQL/backend, production signing, firmware HIL and deployment remain `BLOCKED` or open. Phase 2 is not complete.

### 2026-07-27 — Master-plan Phase 2 canonical device-settings checkpoint

- Android production navigation already used `DevicePairingScreen`; CodeGraph confirmed the deprecated `BluetoothPairingScreen` had zero callers. The 34,467-byte demo was moved outside all source sets to `smart-health-android/archive/legacy-compose` with its pre-archive SHA-256 `BD1A2D0C407C0BBFD49F1D6B13F53071D0F29CCC4E8B56C5D6D6D623D3180626`.
- The archived demo had auto-completed a hard-coded QR after three seconds and represented backend inventory polling as Bluetooth radar discovery. A source contract now prevents those paths from returning. The compatibility URL `bluetooth?...` remains, but it resolves to the canonical QR/manual claim and secure Wi‑Fi setup flow; no BLE surface is exposed.
- `StethoscopeSettingsScreen` now reads immutable ViewModel state backed by the real device list. It has loading, empty, error, stale, retry and confirmed refresh states; it displays backend/device-reported presence, firmware, battery, Wi‑Fi RSSI and last-seen data without inventing zero-value metrics.
- Volume, sensitivity, noise-cancel and auto-connect controls were removed because no Android/firmware consumer applies those stored values. Calibration was removed because backend intentionally returns `DEVICE_CALIBRATION_UNAVAILABLE` until a validated firmware algorithm exists. The UI now states that advanced controls require a shared contract and device ACK.
- Shared settings rows were moved from a screen file into `ui/components` with switch/button semantics and 64 dp rows, preserving Data Storage compilation without reintroducing unsupported device controls.
- Fresh proof: `322/322` JVM tests across `53` suites, `assembleDebug`, lint with `0` Fatal/Error and `39` warnings, `37/37` connected tests on `Shcare_RC2_API35(AVD)` / Android 15, and clean `git diff --check`.
- Debug APK: `24,757,443` bytes, SHA-256 `28225D36BAB539A032732DDE7B84C77DB52F784A9B9BAF3E29EBD88B6D4789A8`.
- This does not prove setup AP on hardware, authenticated WSS presence, physical Wi‑Fi provisioning, firmware ACK, BLE/GATT, calibration, OTA or production deployment. Those remain separate `BLOCKED`/unsupported gates. Global progress remains **Phase 2 in progress**.

### 2026-07-27 — Master-plan Phase 2 Android Record/audio artifact checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and overall progress remains **Phase 2 in progress**. This is an additive implementation checkpoint, not a new plan or an internal `8E-*` phase.
- Record Detail no longer draws a fake waveform, calls the API directly from a composable or reports a local-only success. It uses an immutable ViewModel state/effect contract with explicit loading, not-found, permission, offline, stale, retry and error behavior. The compact layout uses one lazy timeline; sufficiently wide layouts use an Android-native two-pane composition rather than a stretched phone or copied Web layout.
- The waveform is loaded from a tenant-authorized backend artifact bound to the exact canonical `scanId`, validated at a maximum of 512 normalized points and 256 KiB. PostgreSQL and JSON repositories select the newest AI result; storage rejects oversized objects before reading them into the response. Cross-workspace reads remain denied and audited.
- Audio access is short-lived and authenticated. Same-origin playback/download uses the current immutable auth-session epoch; foreign provider URLs must be HTTPS and never receive the backend bearer header. Download is bounded to 40 MiB, uses a partial file plus atomic replacement, reports progress and deletes incomplete data on failure.
- Native playback owns audio focus, lifecycle pause, reconnect/error state and release outside Compose. Save uses the system document picker. Share uses Android Sharesheet through a non-exported `FileProvider`; the app-private cache is restricted to `record-audio`, bounded to eight files/24 hours and cleared during account teardown.
- The shared HTTP v1 package now publishes closed waveform and audio-access schemas/fixtures. New clients do not persist or display the compatibility-only storage object key and do not invent clinical data when an artifact is missing.
- Fresh proof: shared contracts `16/16`; backend `check`, base test, API-production, repository, storage, workspace-access and KLT-contract gates; OpenAPI YAML parse; `git diff --check`; Android `339/339` JVM tests across `56` suites, `assembleDebug`, lint with `0` Fatal/Error and `43` warnings, plus `40/40` connected tests on `Shcare_RC2_API35(AVD)` / Android 15.
- Debug APK is `24,771,946` bytes, SHA-256 `993A65B641ED179EE3163EDF64BFBF90CAD04FE6519EAF0ADDF5F348F3403CC3`.
- This is source/build/local/emulator proof only. `google-services.json` is absent; live PostgreSQL/S3/Firebase/FCM/provider behavior, production signing, a physical Android device, manual TalkBack/golden/IME/rotation checks, firmware HIL and deployment remain `BLOCKED` or open. Firmware impact is `N/A` for this UI slice because the PCM/audio protocol and minimum firmware contract did not change.
- Phase 2 is not complete. Continue with Data Storage/Notification Settings and remaining Android production screens, real Patients/Alerts destinations, the remaining adaptive/accessibility matrix and the independent Web/Admin UI-foundation acceptance work.

### 2026-07-27 — Master-plan Phase 2 Android storage/export truthfulness checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and overall progress remains **Phase 2 in progress**. This is an additive checkpoint under the original Phase 0–8 overview, not a replacement plan or an `8E-*` phase.
- Backend storage summaries now derive tenant-visible object/file counts and exact byte totals from real storage records. Device-local usage, cache, quota, auto-sync and cloud-backup values are no longer seeded or inferred: compatibility fields return zero/false until a real provider contract exists.
- Android Data Storage uses repository/ViewModel immutable state with loading, empty, permission, offline, stale, retry and failure paths. It combines the authorized backend summary with an app-private audio-cache measurement. Clearing local cache works without a backend round trip and reports success only after no local cache file remains.
- Storage and export routes are capability-gated. The platform-wide delete screen and `/data/all` Android client method were removed from the production app; the exact 7,731-byte legacy source is archived outside all source sets with SHA-256 `6E2E3E546F7EB35391764C2645B6C8EB4FA87AC00806373200F3AB6B51ABA792`.
- Export supports only PDF, CSV, XLSX and JSON. Creation uses a stable idempotency key for ambiguous retries and rotates it after a confirmed document save. Android validates creator, canonical workspace, scope, format, renderer `shcare.export-artifact.v1`, non-empty size and SHA-256 before downloading.
- Artifact download is authenticated and same-origin, bounded to 100 MiB, auth-epoch checked, MIME/renderer/length/SHA verified, streamed through a partial file and cleaned on failure. Only after verification does Android open a MIME-specific system document picker; it acknowledges success only after the selected document provider receives the complete byte count.
- Shared HTTP v1 now publishes closed storage-summary and export-create schemas/fixtures. Fresh proof: contracts `18/18`; backend `check`, base test, API-production, repository, storage, workspace-access and KLT-contract gates plus OpenAPI YAML parse; Android `356/356` JVM tests across `61` suites, debug assemble, lint `0` Fatal/Error (`42` warnings, `1` hint), and `44/44` connected tests on `Shcare_RC2_API35(AVD)` / Android 15. The emulator suite includes dark/font-200% storage/export UI, offline retry and a byte-for-byte write/read/cleanup through Android `ContentResolver`.
- Debug APK is `24,771,669` bytes, SHA-256 `28DF0BE4F51D4B1C937877C3812D4C06877A41A932017172BED100CBA88B8888`.
- This remains source/build/local/emulator proof. `google-services.json` is absent; live PostgreSQL/S3/provider export, production signing, physical-device/manual TalkBack/golden/IME/rotation checks, firmware HIL and deployment remain `BLOCKED` or open. Firmware impact is `N/A` because this slice does not change device protocol or firmware behavior.
- Phase 2 is not complete. Continue with Notification Settings and the remaining Android production screens, real Patients/Alerts destinations, the rest of the adaptive/accessibility matrix and the independent Web/Admin UI-foundation acceptance work.

### 2026-07-28 — Master-plan Phase 2 cross-surface notification-preferences checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The global overview remains Phase 0–8 with **Phase 2 in progress**; this is an additive checkpoint, not a new plan or an `8E-*` governing phase.
- The actor is the authenticated account owner. `GET /api/v1/me/notification-preferences` returns canonical owner/workspace, account-wide cloud preferences and honest `inApp`/`email`/`push` availability. `PATCH` accepts exactly one published boolean field plus `Idempotency-Key`; it is self-authorized, active-account checked, atomic, audited, replay-stable and rollback-safe.
- Portal `/portal/settings` now loads that canonical snapshot and PATCHes only changed fields. It verifies the exact returned user/workspace/value, preserves an idempotency key across ambiguous retry, advances the cache after each confirmed field and guards unsaved changes. It no longer writes a whole locally derived map through `/me`, so it cannot overwrite an Android change with stale Portal state.
- Android keeps a distinct native UI. Its cloud toggles use the same field-level contract, while sound, vibration and visibility are explicitly owned by Android system channel settings. Stable channel IDs prevent a locally generated variant from bypassing a disabled channel. Runtime permission, app-level notification state, channel state and encrypted session binding are evaluated separately; a permission callback cannot fabricate readiness.
- Push remains a data-only protocol-v2 wake-up with no clinical provider copy or provider deep link. Every attempt reloads account, membership, device/token ownership and auth-session eligibility. Campaign delivery recomputes global/category opt-out and cannot retarget immutable recipient/workspace content. Non-platform visibility fails closed and generic notification factories do not fan private content to platform-admin email.
- Impact record: Web route `/portal/settings`; Android screen `NotificationSettingsScreen`; personal preferences are not a Platform Admin surface, while platform campaign/settings persistence remains a separate Admin slice; firmware impact is `N/A` because no device protocol or firmware behavior changed. This preference slice adds no migration; it remains compatible with the previously recorded notification-device binding migration `044`.
- Fresh proof: shared HTTP/device contracts `20/20`; focused backend preference `18/18`, push `9/9` plus smoke, and campaign `8/8`; the previously run backend check/base/API-production/repository/storage/workspace/KLT/OpenAPI gates remain green and backend `npm audit` is `0` vulnerabilities. Portal Web passes lint with zero findings, Auth/component tests `109/109`, route/API contracts `63/63`, and client/SSR build. The focused Portal notification tests are included in the `109/109` result.
- Android passes `373/373` JVM tests across `64` suites, debug assemble, lint with `0` Fatal/Error (`42` warnings, `1` hint), and `46/46` connected tests on `Shcare_RC2_API35(AVD)` / Android 15. Debug APK: `24,781,570` bytes, SHA-256 `78CBC616010EF6246B2B8F33CF4B3187475EB70B93215FC6BD8B0F15EB866DAB`.
- Evidence remains source/build/local/emulator only. `google-services.json` is absent; live Firebase/FCM/email/provider delivery, live PostgreSQL, production signing, physical Android device, manual TalkBack/golden/IME/rotation checks, firmware HIL and deploy remain `BLOCKED` or open. The Web package has no lockfile, so a separate Web `npm audit` returned `ENOLOCK` and is not claimed as proof.
- Phase 2 is not complete. Continue with remaining Android semantic/adaptive screens and real Patients/Alerts, then close the independent Web/Admin brand, primitive, responsive, accessibility and browser acceptance matrix. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` and unchanged.

### 2026-07-29 — Master-plan Phase 2 native Patients/Alerts checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**; this is the direct continuation of the notification checkpoint, not a new plan or an `8E-*` governing phase.
- Android now exposes real doctor-facing Patients and Alerts destinations through typed route/capability contracts and the canonical workspace authority. Both are native Material 3 surfaces with independent mobile information architecture, compact list/detail navigation, an 840 dp two-pane mode, lazy lists, dark theme, font-scale handling, 48 dp targets, TalkBack headings/state descriptions and explicit loading, empty, stale, offline, permission, error and retry states. No Web component or Web layout was copied into Compose.
- Patients uses the workspace-bound backend list and exposes only confirmed demographics, contact, blood type, allergies, emergency contact and scan metadata. Search cannot replace an unfinished initial load, and a cross-workspace response is rejected as a whole.
- Alerts uses the backend `open|acknowledged|resolved` ledger and capability-gates acknowledge/resolve. Timeout retry keeps one idempotency key and no optimistic status. HTTP `409` now closes the stale dialog, blocks another mutation while the current filter reloads and emits only a refresh message after the new snapshot succeeds; it never emits a false acknowledge/resolve success. Backend confirmation must match workspace, alert ID, target status and exactly the next version.
- Impact record: actors are workspace clinicians with patient-read and optional alert-manage capability; Web counterparts remain `/portal/patients` and `/portal/alerts`; Platform Admin `/patients` remains a separate platform operation and no Admin alert UI changed in this slice; Android destinations are `clinical-patients` and `clinical-alerts`; firmware impact is `N/A`; no migration or deploy occurred.
- Fresh source/local proof: shared contracts `23/23`; backend syntax check, clinical workflow repository `8/8`, workspace-access and repository smokes; focused Android ViewModel/API/UI-contract tests and AndroidTest compilation; full Android JVM `395/395` across `68` suites; `assembleDebug`; lint `0` Fatal, `0` Error, `43` Warning and `1` Hint with no Patients/Alerts lint finding; repository `git diff --check`.
- Debug APK is `23,779,001` bytes, SHA-256 `ED69FED5B831BA3480ABB4F9712ACFC77117D4FD7CCC5AA223045CA964D20347`.
- Runtime evidence for this new slice is **BLOCKED**. The only AVD is `Pixel_8_Pro_2`; a bounded cold boot exposed `emulator-5554 offline`, no QEMU process and no `sys.boot_completed`. The process created by this run was stopped and no emulator/QEMU process remains. Therefore the new Patients/Alerts instrumentation tests are compiled but not claimed as executed. `google-services.json`, live provider/PostgreSQL, production signing, physical Android, manual TalkBack/golden/IME/rotation, firmware HIL and deployment also remain unproven.
- Phase 2 is not complete. Continue the remaining native semantic/adaptive acceptance work and close the independent Web/Admin brand, primitive, responsive, accessibility, browser and visual matrix. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` and unchanged.

### 2026-07-29 — Master-plan Phase 2 Notification Inbox working checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Global progress is still **Phase 2 in progress**. This durable entry records an interrupted in-progress slice so a future run resumes it instead of redoing earlier work.
- Implemented so far: closed shared HTTP inbox response/mutation schemas; backend owner/current-workspace list and idempotent read/read-all/delete transactions with audit; Portal canonical responsive inbox; Android repository/ViewModel and native Material 3 screen with complete operational states and destructive confirmation.
- Current proof: Portal lint/build green; backend notification inbox `8/8` including PostgreSQL atomic commit/replay and rollback on audit failure, workspace-access smoke green; Android focused API/ViewModel tests were green. The newly tightened Android accessibility source test is intentionally red until the technical progress state description is replaced by a localized resource.
- Resume at that single red test, then complete OpenAPI/package-script/contract documentation parity and run the full source/build/local gates. Emulator, provider/live, physical-device/manual accessibility, production signing, firmware HIL and deployment remain separate proof and must not be fabricated.
- Restart policy: read the canonical handoff/ledger and current worktree first; preserve all prior completed slices; never reset or rewrite the whole plan because context was compacted, quota expired or the host was powered off. A repeated test run confirms evidence but does not reopen a verified feature by itself.

### 2026-07-29 — Master-plan Phase 2 Notification Inbox source/local closure

- This continues **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and supersedes only the preceding in-progress Notification Inbox checkpoint. Global progress remains **Phase 2 in progress**; Phase 0–1 and all earlier verified Phase 2 slices stay closed at their recorded proof levels.
- Actor and surfaces: an authenticated Portal or Android user reads and mutates only their personal inbox in the current active workspace. Portal route is `/portal/notifications`; Android uses its independent native `Notifications` destination. Platform Admin is `N/A` because this is not campaign/fleet administration. Firmware is `N/A` because no device command, event or protocol is changed.
- Contract/data impact: versioned list and mutation schemas cover list, read, read-all and delete. Mutations require `Idempotency-Key`, return the full canonical owner/workspace snapshot and write audit atomically. No destructive migration was added. Deploy order remains backward-compatible backend/contracts first, then Portal/Android; rollback is client rollback plus the previous backend while compatibility aliases remain.
- Source/local proof: shared contracts `25/25`; backend check/base/inbox/repository/workspace/API-production/KLT gates, inbox repository `8/8`, OpenAPI parse with `68` paths and all internal schema references resolved; Portal Auth/component `117/117`, contracts `63/63`, lint/build and Chromium browser smoke `66` checks across three viewport/theme cases; Android `407/407` JVM tests in `71` suites, AndroidTest compilation, assemble and lint with `0` Fatal/Error.
- Browser QA found two route-level `h1` elements in the Portal shell. The top-bar copy is now non-heading context while each page retains its canonical `h1`; CSS selectors preserve the visual hierarchy at desktop and mobile widths.
- Debug APK is `23,826,433` bytes with SHA-256 `6AF72E75960018E43F074E7AC281C84CE7B6BFDD0378ACCD684B2B12BFEA0DA8`. Android instrumentation did not run: the stale ADB-offline emulator was stopped and no device is attached. Provider/live database, production signing, physical/manual accessibility, firmware HIL and deployment evidence remain separate `BLOCKED`/open rows.
- Interruption recovery is now explicit in both handoff and ledger: inspect the latest closure, current worktree and narrow evidence first; test reruns verify drift but never authorize redoing a closed feature. The next aligned work stays inside Phase 2 on remaining Web/Admin UI-foundation and Android adaptive/manual acceptance.

### 2026-07-29 — Master-plan Phase 2 canonical Web primitive-tree closure

- The governing plan and visible status remain **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**, **Phase 2 in progress**. Existing Admin/UI, domain and Android checkpoints were inspected and preserved instead of being redone.
- Admin CodeGraph was restored locally because the root index omitted the Unicode Admin subproject. The ignored Admin index is healthy at `177` files / `2,218` nodes / `4,831` edges; this is local tooling metadata, not a product artifact.
- Web primitive inventory resolved every static import target: `104` imports already used `src/components/ui`, while Audit, Reports and Permission Denied retained `12` imports into `src/app/components/ui`; `PortalState` and `PortalExportDialog` retained another `8` shorthand `./ui/*` imports. After migration, all `48` duplicate files and the empty directory were removed.
- Regression guard `canonical-ui-primitives.test.ts` rejects the duplicate directory and resolves every relative/alias source import to prevent it from returning under a different spelling. The first red and a later full-build red were both retained as evidence that the guard catches directory and shorthand-import drift.
- Browser proof found and fixed the Permission Denied heading regression without changing the canonical `CardTitle` contract globally. Audit, Reports and 403 now retain their route-level heading hierarchy and canonical styling.
- Evidence: Web contracts `64/64`, Auth/UI `117/117`, lint, client/SSR build, CSS `387.99 KB` raw / `60.44 KB` gzip, UI-foundation Chromium `123` checks across three routes and three viewport/theme cases, plus Notification Inbox browser `66/66`. Zero serious/critical axe, console/request, overflow, theme or sub-44 px failures remained in the targeted matrices.
- Firebase build preflight is explicitly `BLOCKED` by six absent `VITE_FIREBASE_*` values. No production environment, provider, deployment or live route was exercised. Backend, Android and firmware impact is `N/A`.
- Next continuation stays within Phase 2: inventory and remove only reproduced legacy CSS/route styling fragments, then retain separate Android adaptive/manual acceptance. Do not recreate `src/app/components/ui`, reopen closed Admin slices or claim Phase 2 complete.

### 2026-07-29 — Master-plan Phase 2 Portal device-assignment closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**, with global progress at **Phase 2 in progress**. This is the bounded route slice immediately after canonical Web primitives, not a replacement task.
- TDD first reproduced four gaps on `/portal/devices/assign`: legacy visual classes, no complete empty/offline/retry states, unscoped client queries and a mutation that could announce local success without idempotency or an exact receipt. The route now uses canonical Card/Button/Label/Select/Alert primitives, Shcare theme tokens, responsive 44 px controls and complete operational states.
- Authority is fail closed. Available devices must be non-revoked, unassigned and bound to the exact current workspace; patients must match that workspace. One user intent retains one key through duplicate submit or ambiguous retry. Success requires a canonical receipt matching workspace, device and patient before navigation or notification.
- Canonical `PATCH /api/v1/portal/devices/{deviceId}` requires `Idempotency-Key`. Backend-first deployment remains compatible because legacy `/api/portal/devices/{deviceId}` accepts a missing key only during the compatibility window; key-bearing alias requests use the same replay and conflict enforcement.
- JSON and PostgreSQL ownership writes now place the ownership snapshot, audit entry and idempotency receipt in one atomic boundary. Replay returns the stored outcome without another write/audit. Different payload reuse, stale ownership, invalid patient, cross-tenant assignment and forced persistence/audit failures fail closed.
- Impact record: actor is a workspace device operator; API is the canonical v1 ownership mutation; Portal route is `/portal/devices/assign`; Platform Admin is `N/A` because fleet provision/revoke/OTA remains a separate surface; Android is `N/A` because its claim, secure Wi-Fi provisioning and own-device status UI is native and distinct; firmware is `N/A` because no WSS, command, telemetry or OTA contract changed. Existing idempotency storage is reused, no destructive migration or notification event was added, and rollback is independently reverting the Web client or compatible backend.
- Evidence: focused Web `6/6`; repository `36/36`; shared HTTP `19/19`; Web Auth/UI `123/123`; Web contracts `64/64`; lint and client/SSR build; CSS `380.47 KB` raw / `59.39 KB` gzip; Chromium `189` checks over four routes and three viewport/theme cases with zero targeted axe serious/critical, overflow, console/request, theme or sub-44 px failures; backend check/base/repository/KLT/workspace; OpenAPI `69` paths; `git diff --check`.
- One earlier workspace run met a transient Windows `EBUSY` on its own fixture database. A single bounded rerun passed, and the final compatibility run passed directly; no product or harness failure was hidden.
- No Firebase production, live provider/database, deploy, Android runtime/manual, physical-device or firmware-HIL proof is claimed. Phase 2 remains open. Recovery after quota loss or power-off starts from this ledger, the latest handoff and current diff; a narrow rerun checks drift but does not authorize reopening closed slices.

### 2026-07-29 — Master-plan Phase 2 Portal Billing Summary closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**, with global progress at **Phase 2 in progress**. This bounded route follows Device Assignment in the same worktree and does not replace the master plan or reopen a closed slice.
- TDD reproduced the Billing gaps before implementation: seven legacy/demo-style occurrences, missing explicit partial/offline states, a loosely accepted response, and UI copy that exposed a technical provider field while blank package data could look like a zero charge.
- `/portal/billing` now uses canonical Web primitives, Shcare semantic tokens, responsive layout, one route heading, 44 px controls and explicit loading, empty-package, empty-usage, error/retry and offline states. It renders only backend-measured usage/quota and explains that billing remains a manual support workflow.
- Canonical `GET /api/v1/portal/billing` is workspace-authorized. The Web parser requires exact active-workspace and subscription ownership, internally consistent bounded usage rows, a package/charge match when present, and `invoicePolicy.mode=manual` with `providerConfigured=false`. It fails closed instead of manufacturing invoices, checkout, quota or success. The legacy read alias remains for backend-first compatibility.
- Browser validation found and fixed one light-theme color-contrast failure. The five-route harness now places the assignment mutation last so its successful navigation cannot create an aborted-request false failure for Billing.
- Impact record: actor is a workspace user with billing-view authority; API is the canonical v1 billing read; Portal route is `/portal/billing`; Platform Admin package management is unchanged; Android is `N/A` except optional future native read-only plan status; firmware is `N/A`; no migration, notification, mutation, payment provider or device contract changed. Rollback may revert Web independently while the compatible backend read remains.
- Evidence: focused Billing `6/6`; shared HTTP `20/20` and all contract tests `27/27`; Web Auth/UI `129/129`; Web contracts `64/64`; lint and client/SSR build; CSS `380.79 KB` raw / `59.43 KB` gzip; Chromium `246` checks over five routes and three viewport/theme cases with zero targeted axe serious/critical, overflow, console/request, theme, legacy-style or sub-44 px failures; backend check/base/repository/workspace/KLT gates; OpenAPI `70` paths with internal references resolved; clean diff check.
- No Firebase production, live provider/database, deploy, Android runtime/manual, physical-device or firmware-HIL evidence is claimed. Phase 2 remains open. On interruption, this closure plus the latest handoff and current diff are authoritative; rerun only the narrow gate needed to detect drift, and never redo a verified slice without a reproduced regression.

## 2026-07-29 — Phase 2 Portal Dashboard truthfulness/UI-foundation closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Global progress remains Phase 0–8 with **Phase 2 in progress**. This row is the direct additive successor to Portal Billing, not a new `8E-*` plan.
- Dashboard now renders only backend-confirmed, active-workspace data. The canonical overview response includes `workspaceId` and measured `devicesCount`; Web validates the requested `today` range/timezone and requires exact cross-totals for measures, device presence and AI lifecycle before rendering. Missing or contradictory facts fail closed instead of becoming zero.
- The recent-scan list is supplemental, capability-gated and exact-workspace checked. Its loading/empty/error/retry/permission state is independent from the confirmed overview, so a partial failure cannot erase KPI truth. Raw `aiLabel` values no longer drive or leak a fake review count.
- UI impact is Portal-only: `/portal/dashboard` uses the canonical Web primitive tree, semantic light/dark tokens, one `h1`, responsive layout, 44 px controls and explicit first-load/offline/partial states. Platform Admin and native Android dashboards remain independently designed. Firmware is `N/A`; there is no migration, mutation, notification or device-protocol change.
- Release order is additive backend first, then Web. The legacy unversioned read alias remains during the compatibility window, and Web can be rolled back independently. Platform Admin tolerates the additive response fields.
- Evidence: focused Dashboard `7/7`; shared HTTP `21/21` and all contracts `28/28`; Web Auth/UI `136/136`; Web contracts `64/64`; lint and client/SSR build; CSS `381.26 KB` raw / `59.50 KB` gzip; Chromium `306` checks over six routes and three viewport/theme cases with no targeted serious/critical axe, overflow, console/request, theme, legacy-style or sub-44 px failure; backend check/base, overview `4/4`, repository/workspace/KLT; OpenAPI `/api/v1` with `70` paths, `345` internal references and none missing; clean diff check.
- No Firebase production, live provider/database, deploy, Android runtime/manual, physical-device or firmware-HIL evidence is claimed. Deep Security Scan remains untouched at `running/preflight`. On interruption, resume from this row, the latest handoff and current diff; do not repeat a closed slice without reproduced regression evidence.

## 2026-07-29 — Phase 2 Portal Onboarding truthfulness/UI-foundation closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Global progress remains Phase 0–8 with **Phase 2 in progress**; this row is additive after Dashboard.
- Onboarding now renders a role-specific checklist from confirmed `/me`, patient/device and Billing reads. Exact membership/workspace identity is required, unauthorized datasets are omitted and cross-workspace/malformed rows fail closed. Error/offline/unknown data is not mislabeled as an incomplete user task or included as negative completion.
- UI is Portal-native: canonical primitives and semantic tokens, one heading, responsive cards, 44 px controls, reduced-motion-safe progress and independent loading/incomplete/unknown/error/retry/offline states. Android retains a separate native first-run experience; Platform Admin and firmware are `N/A`.
- No backend schema, mutation, migration, notification or device protocol changed. Existing Billing/list compatibility remains unchanged; Web can deploy or roll back independently.
- Evidence: focused TDD Onboarding `4/4` after a recorded `4/4` red baseline; contracts `28/28`; Web `140/140` Auth/UI and `64/64` route contracts; lint/build; CSS `381.21 KB` raw / `59.50 KB` gzip; Onboarding chunk `11.94 KB` raw / `4.12 KB` gzip; Chromium `363` checks over seven routes × three viewport/theme cases with no targeted axe serious/critical, overflow, console/request, theme, legacy-style or sub-44 px failure; same-checkpoint backend/OpenAPI gates; clean diff check.
- Firebase production/live/provider/deploy, Android runtime/manual, physical-device and firmware-HIL proof remain open. Deep Security remains untouched at `running/preflight`. Resume next from the reproduced Help/support gap; never reopen this or older slices without a current failing gate.

## 2026-07-29 — Phase 2 Portal Help/support truthfulness/UI-foundation closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible progress is still **Phase 2 in progress**. This row is additive after Onboarding; it does not reopen or replace any prior Web, Admin or Android checkpoint.
- TDD reproduced the Help gaps before implementation: legacy demo styling, invented SLA/contact details, no complete offline/retry/unsaved state, blind success and a backend self-notification pretending to be a support ticket. The route now uses canonical primitives/tokens, one `h1`, responsive guide/search/form/receipt composition, 44 px controls and exact loading/validation/offline/submitting/retry/confirmed states.
- Canonical `POST /api/v1/portal/support` accepts only type and description plus a required header idempotency key. Active workspace and requester are backend authority. Web validates exact owner, workspace, type, status and timestamp before success; no authority field is accepted from the body. `/api/portal/support` remains a compatibility alias.
- Migration `045_support_tickets.sql`, repository wiring and JSON import create a tenant-private support ledger. Runtime JSON mutations serialize with rollback. PostgreSQL uses one transaction and advisory idempotency lock for the ticket, audit event and replay receipt. Exact replay is stable; changed-payload reuse, inactive tenant and authority injection fail closed.
- Evidence: focused Web Help/API `7/7`; support repository `4/4` including SQL transaction assertions; shared HTTP `22/22` and total contracts `29/29`; Web Auth/UI `147/147`; Web contracts `64/64`; lint and client/SSR build; CSS `381.36 KB` raw / `59.52 KB` gzip; Help chunk `14.65 KB` raw / `5.03 KB` gzip; Chromium `420` checks over eight routes × three viewport/theme cases with no targeted axe serious/critical, overflow, console/request, theme, fake-contact, legacy-style or sub-44 px failure; backend check/base/repository/workspace/KLT; OpenAPI `71` paths / `353` internal references / none missing; clean diff check.
- Impact: authenticated active-workspace Portal member; Web `/portal/help`; later Platform Admin support operations remain independent; Android and firmware are `N/A` for this actor/workflow. Backend migration deploys first, then Web; the alias supports independent Web rollback.
- Provider/live mutation remains `BLOCKED`, not passed. A support ticket is durable and there is no requester withdrawal/cleanup contract yet. The live mutation smoke therefore skips support creation by default; explicit opt-in records the retained ticket and blocked cleanup instead of deleting an unrelated notification or claiming false cleanup.
- Resume after any interruption from this ledger row, the latest handoff and the current diff. A narrow gate may detect drift, but no closed slice is to be rebuilt without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal workspace selection and cross-client contract closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Help/support and does not replace the Phase 0–8 plan.
- TDD reproduced the current gaps before implementation: legacy neon/glow styling, no offline/permission/unavailable-metric state, selectable suspended memberships, missing Web idempotency and no reconciliation when a switch result was lost or unconfirmed.
- Shared HTTP v1 now locks the switch body to `{ organizationId }`. Web uses a caller-owned intent-stable key on `PATCH /api/v1/me`, reuses it for the same failed target, confirms the exact returned workspace or reconciles through authenticated `/me`, and clears PHI query state before publishing any changed authority. Backend membership and workspace operational status remain the only authorization source.
- `/portal/workspace` now uses canonical Web primitives/tokens, one `h1`, responsive 44 px interaction and explicit loading/session-denied/empty/offline/error/retry/switching/active/non-operational/unavailable-metric states. Missing counts are not mapped to zero and suspended/revoked/inactive targets cannot mutate.
- Android remains independently native. Its existing API/ViewModel already follows the same business contract and focused `SmartHealthProfileApiTest` plus `WorkspaceSwitcherViewModelTest` passed. No Android layout was copied from Web and no firmware change was needed.
- Evidence: focused Web `10/10`; shared HTTP `23/23`, total contracts `30/30`; Web `153/153` Auth/UI plus `64/64` route contracts; TypeScript/lint/client+SSR build; CSS `381.77 KB` raw / `59.59 KB` gzip; Workspace chunk `8.94 KB` raw / `3.34 KB` gzip; Chromium `459` checks over nine routes × three viewport/theme cases; backend check/workspace-access; focused Android workspace tests; clean diff check.
- Firebase/live/provider/deploy, Android emulator/device/manual accessibility and firmware HIL remain open. Deep Security stays untouched at `running/preflight`. Resume from Workspace Settings in this same Phase 2; do not reopen this or older rows without a reproduced regression.

## 2026-07-29 — Phase 2 Portal Workspace Settings UI-foundation closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Workspace Switcher and does not replace the Phase 0–8 plan.
- TDD reproduced the current UI/state gaps before implementation: legacy demo styling and custom tabs, eager cross-tab requests, unverified account/workspace snapshots, incomplete draft protection and sub-44 px controls. The first focused run was deliberately red at `6/12`; the completed implementation passes `12/12`.
- `/portal/settings` now uses canonical Shcare primitives and semantic tokens, one `h1`, accessible tabs, responsive layout, 44 px interaction and explicit loading, denied, offline, validation, submitting, retry, unsaved and confirmed states. Initial Profile loads only `/me`; Security, Notifications and Workspace data are lazy by active tab.
- Account data must belong to the authenticated user and workspace data must belong to the active workspace before it can populate the page. Profile/workspace/password/notification drafts use one unload guard, and dirty state clears only after confirmed mutation outcomes. Existing session confirmation and field-level notification PATCH behavior are preserved.
- Evidence: focused `12/12`; Web Auth/UI `157/157`; route contracts `64/64`; TypeScript and ESLint; client/SSR build with `2,520`/`173` modules, CSS `379.13 KB` raw / `59.20 KB` gzip and route chunk `50.32 KB` raw / `14.66 KB` gzip; Chromium `525` checks across ten routes × three viewport/theme cases. The final diff and legacy-style scans follow this documentation write.
- Impact: authenticated Portal member; Web `/portal/settings`; Platform Admin keeps a separate management UI; Android keeps independent native Profile/Password/Notification/Workspace surfaces; firmware is `N/A`. This slice adds no backend migration, notification contract or device protocol.
- This is an honest UI-foundation closure, not full settings lifecycle completion. Stable retry idempotency plus transaction/audit parity for legacy profile/workspace/avatar/password mutations moves to the still-open Phase 3 identity/security row. Firebase/live/provider/deploy, Android runtime/manual accessibility, physical-device and firmware-HIL proof remain open or `BLOCKED`.
- Resume after interruption from this row, the latest handoff and current diff. Run a narrow drift gate only; do not rebuild this or any older closure without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal Patients list/detail UI and authority closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Workspace Settings and does not replace the Phase 0–8 plan.
- TDD first reproduced list/detail defects: active-workspace identity was absent from query keys and response parsing, a dirty create draft did not participate in the unload guard, detail used a raw button, and patient scan history was not independently checked against both active workspace and route patient. Recorded red baselines were page `2` failed / `3` passed, contract/static `2` failed / `9` passed, followed by the expected missing-export failure for the scan-history parser.
- Patient list/detail queries are now workspace-scoped. Patient records fail closed on missing or foreign `organizationId`; scan history fails closed on missing, foreign or duplicate `scanId`, workspace or patient identity. The UI shows a retryable scan error instead of rendering cross-source PHI.
- `/portal/patients` protects dirty create drafts, preserves canonical ID versus patient code, and invalidates only its workspace query family. `/portal/patients/:id` uses canonical navigation primitives and retains previously closed exact mutation receipts, stable retry keys and destructive confirmation.
- Evidence: focused Patient UI `6/6`; focused contract/static `12/12`; full Web Auth/UI `160/160`; route contracts `66/66`; TypeScript and ESLint; client/SSR build with `2,520`/`173` modules, CSS `379.13 KB` raw / `59.20 KB` gzip, Patients `11.98 KB` / `4.33 KB`, Patient Detail `14.09 KB` / `4.87 KB`, patient form `14.34 KB` / `4.10 KB`; Chromium `624` checks over twelve routes × three viewport/theme cases; clean legacy/raw-style and diff checks.
- Impact: authenticated Portal patient/clinician/workspace member; Web routes `/portal/patients` and `/portal/patients/:id`; Platform Admin keeps an independent dense-management UI; Android keeps native Patient/Family/Profile screens; firmware is `N/A`. No backend migration, notification schema or device protocol changed.
- This closes source/build/local-browser list/detail foundation only. The earlier Patient CRUD and Import backend transactions remain closed and were not rebuilt. Firebase/live/provider/deploy, Android runtime/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`.
- Resume after interruption from this row, the latest handoff and current diff. Continue with Patient Import UI-foundation/browser acceptance without reopening its existing atomic backend lifecycle; no closed slice is rebuilt without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal Patient Import UI and authority closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Patients list/detail and preserves the previously closed backend import transaction.
- TDD first proved that validation could accept a foreign workspace/file, batch refresh could accept foreign or stale identity, operations could overlap, successful commit invalidated a legacy unscoped cache and the permission state lacked a route heading. Recorded red baselines were parser `2/5` and Patient UI `5/8`.
- Validation now requires exact active workspace plus file name/size. Batch detail requires exact workspace/batch and a non-regressing version; commit requires a strictly newer version and exact committed counts/IDs. An operation epoch drops late responses after workspace/reset changes, all three operations share one in-flight lock, and commit invalidates only the active-workspace patient query family.
- UI is Portal-native: canonical primitives, semantic light/dark tokens, accessible permission heading and table caption, focus-visible file control, 44 px actions and explicit validation/preview/busy/retry/confirmed states. The browser sweep reproduced and fixed a light-theme file-label contrast defect; its route-navigation abort false positive was removed by settling Device Assignment before advancing.
- Evidence: parser `5/5`; Patient UI `9/9`; contract/static `10/10`; full Web Auth/UI `163/163`; route/contracts `68/68`; TypeScript and ESLint; client/SSR build with `2,520`/`173` modules, CSS `379.43 KB` raw / `59.30 KB` gzip and Patient Import `30.17 KB` raw / `9.06 KB` gzip; Chromium `702` checks across thirteen routes × three viewport/theme cases; clean legacy/raw-style and diff checks.
- Impact: authenticated Portal member with patient-import capability; Web `/portal/patients/import`; Android is explicitly `N/A` because batch import is Web/Admin-only and its native Patient/Family UI remains independent; Platform Admin remains separate; firmware is `N/A`. No backend migration, notification schema or device contract changed.
- Source/build/local-browser evidence is closed. Firebase/live/provider/deploy, Android runtime/manual accessibility, physical-device and firmware-HIL proof remain open or `BLOCKED`; Phase 3 settings mutation parity remains open. Existing non-blocking TanStack build warnings are recorded rather than hidden.
- Resume after interruption from this row, the latest handoff and current diff. Continue by inventorying Appointments, the next Phase 2 row in the original plan order; never reopen this or an older closure without a current reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal Appointments UI and authority closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Patient Import and preserves the previously closed backend lifecycle plus native Android appointment implementation.
- TDD reproduced the current defects before implementation: the operation parser did not exist, all five initial component cases failed, list/detail/mutation results were not exact-workspace bound, detail reused a list row, retry changed the idempotency key, dirty drafts had no unload guard, late workspace responses could publish success, and suspended staff remained assignable in the backend doctor catalog.
- Portal now parses exact canonical appointment and nested identities, rejects unknown lifecycle/type or contradictory time windows, fetches exact detail, and validates every mutation receipt against the current intent. Stable retry attempts rotate only when operation/workspace/target/payload changes. Workspace epoch changes synchronously suppress late results and close stale PHI/draft/dialog state.
- Backend staff listing keeps suspended members visible in the staff ledger but marks operational truth and returns only active, approved, operational doctor memberships in the assignable catalog. Mutation-time `validateAppointmentDoctor` remains the final backend authority. The backend smoke recorded the former `true !== false` defect, then passed after the additive response correction.
- Portal UI uses canonical primitives, Table/Caption and semantic status tokens with independent phone cards and desktop table, 44 px interactions, dirty-discard protection and loading/empty/error/retry/offline/permission/busy/destructive/confirmed states. The first Chromium run failed two phone-light accessibility checks; status contrast and definition-list semantics were fixed before the final green run.
- Evidence: component `7/7`; focused operation/static `9/9`; full Web Auth/UI `170/170`; Web contracts `73/73`; TypeScript, full ESLint and client/SSR build (`2,521`/`174` modules); CSS `378.84 KB` raw / `59.25 KB` gzip; Appointments `36.25 KB` raw / `9.94 KB` gzip; Chromium `807` checks over fourteen routes × three viewport/theme cases; backend `check` and `smoke:appointment-contract` (`6/6` push-contract adjunct plus full workspace-access); focused Android appointment `26/26` and `assembleDebug`; clean legacy/diff checks.
- Impact: authorized Portal scheduler/clinician; Web `/portal/appointments`; Android keeps its independent native patient/doctor workflow and was regression-tested without UI copying; Platform Admin remains independent; firmware is `N/A`. No migration, notification schema or device protocol changed. Backend deploys first because the new Web parser requires the additive `operational` staff fact; an older Web client ignores it safely.
- Source/build/local-browser and Android unit/build evidence is closed. Firebase/live/provider/deploy, Android emulator/device/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`; the source-verification APK is not Firebase runtime proof.
- Resume after interruption from this row, the latest handoff and current diff. Inventory Review/Alerts/Live next in the original Phase 2 order and never rebuild Appointments or an earlier row without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal Review and Alerts UI/authority closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Appointments and preserves prior native notification/session and clinical-repository work.
- Reproduction proved four separate defects: Review/Alerts direct-route capabilities did not match backend authority; Review responses lacked top-level workspace identity; Web trusted foreign/mismatched mutation receipts; and late responses could publish success after a workspace change. The new component authority cases initially failed `4/9`, and backend workspace smoke recorded the absent Review `workspaceId`.
- `clinical-workflow-operations.ts` now validates exact workspace, source identities, lifecycle evidence, unique IDs, requested decision/transition/note and advancing versions. Pages use workspace-scoped keys/idempotency, synchronous operation epochs and exact receipt confirmation. Route contracts now use `workspace|platform.review.*` and `workspace|platform.alerts.*`.
- Review/Alerts UI uses canonical Shcare primitives/tokens, semantic status colors, accessible card headings and definition lists, 44 px controls and complete loading/empty/offline/permission/retry/busy/destructive/confirmed states. Chromium exposed the Review heading defect on its first 16-route run; the final rerun passed after the semantic fix.
- Backend adds only top-level `workspaceId` to Review list/mutation receipts. Shared JSON schemas/fixtures and OpenAPI document the existing v1 review/alert list and mutation endpoints with exact idempotency and authority boundaries; no migration or device protocol changed.
- Evidence: focused Web clinical/API/PHI `21/21`; full Web Auth/UI `174/174`; Web contracts `77/77`; package contracts `31/31`; TypeScript, ESLint and build (`2,522`/`175` modules), CSS `378.63 KB` raw / `59.17 KB` gzip; Chromium `939` checks over sixteen routes × three cases; backend `check`, clinical workflow `8/8`, workspace-access; OpenAPI `76` paths / `394` internal references / none missing; Android clinical/alerts `20/20` plus `assembleDebug`; clean style/diff checks.
- Impact: authorized clinicians/workspace alert operators; Web `/portal/records/review` and `/portal/alerts`; Android retains an independent native Alerts workflow and is not pixel-matched; Platform Admin remains independent; firmware has no UI change and no protocol impact. Portal Review is Web clinician-worklist scope in this row.
- Source/build/local-browser and targeted Android unit/build evidence is closed. Firebase/live/provider/deploy, Android emulator/device/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`; existing TanStack build warnings remain recorded.
- Resume after interruption from this row, the latest handoff and current diff. Continue Live Monitoring next and never reopen Review/Alerts or an older row without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal Live Monitoring UI/authority closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Review/Alerts and preserves all earlier Web, Android and backend closures.
- TDD reproduced the real gaps before implementation: no strict monitoring parser/shared schema, route capabilities drifted from backend, the REST payload lacked canonical workspace identity and could expose raw device/global infrastructure state, legacy `connected` could masquerade as online, and the waveform rendered unconfirmed zero metrics.
- Canonical `GET /api/v1/portal/monitoring` is now membership-scoped and returns generated time, exact workspace, sanitized devices with authenticated-socket `online`, exact-workspace scans/alerts and a bounded source identity. The legacy read alias remains compatible. Authenticated WSS status hides global connection counts and network ports while retaining source-bound protocol-v2 status/session/metrics/audio.
- Web parsing fails closed on top-level or nested tenant drift, duplicate IDs, missing canonical presence, invalid timestamps and secret/claim verification material. WSS metadata must precede metrics/audio and match every workspace/patient/device/scan/session field. Workspace change closes the prior socket and discards late source events.
- Portal UI uses canonical responsive primitives/tokens and covers loading, empty, cached-partial, refresh failure, browser offline, permission denial, WSS error/backoff/retry, REST-only recording, waiting metadata, active session and packet-gap states. No metric is shown as zero before backend confirmation; device `connected` is never used as presence.
- Evidence: focused Live API/UI `9/9`; Web Auth/UI `183/183`; Web contracts `81/81`; shared contracts `32/32`; TypeScript/lint/build with `2,523` client and `176` SSR modules, CSS `378.63 KB` raw / `59.17 KB` gzip and Live `17.50 KB` / `5.92 KB` gzip; Chromium `987` checks over seventeen routes × three cases; backend check/workspace/clinical `8/8`/device-security `41/41`/audio-v2 `4/4`; OpenAPI `77` paths / `400` valid internal references; Android LiveAudio `13/13` plus `assembleDebug`; clean style/diff checks.
- Impact: authorized Portal monitoring viewers; Web `/portal/live`; Android retains its independent native LiveAudio UI/contract; Platform Admin remains independent; firmware transport and packet format are unchanged. There is no migration, notification, command or OTA impact. Backend deploys first and Web may roll back through the compatibility alias.
- Source/build/local-browser and targeted Android unit/build evidence is closed. Firebase/live/provider/deploy, Android emulator/device/manual accessibility, physical authenticated audio and firmware HIL remain open or `BLOCKED`; the source APK is not Firebase runtime proof.
- Resume after interruption from this row, the latest handoff and current diff. Inventory Portal Devices/Consent next, preserving closed Device Assignment and consent backend work. Never reopen Live or an older row without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal Devices and Consent UI/authority closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Live Monitoring and preserves the earlier Device Assignment, patient-share persistence and native Android closures.
- Strict Device parsing binds the top-level response and every sanitized row to the active workspace, rejects duplicate IDs and secret/claim/Wi-Fi/token material, and requires canonical backend `online`; `connected` is compatibility data only. Exact command receipts bind workspace, device, type, protocol and lifecycle before success is exposed.
- Strict Consent parsing binds target, patient ledger, authority type, lifecycle, scope, recipient principal and grant/revoke audit to the current workspace and patient. Create/revoke receipts must match the caller intent. Workspace epochs suppress late outcomes; stale cached lists remain readable but lock mutations.
- Backend and contract work adds a canonical Portal device projection, workspace/patient response boundaries, four closed HTTP v1 schemas/fixtures and shared OpenAPI Path Items for `/patients/...` plus `/portal/patients/...`. Compatibility paths resolve to one schema rather than two business contracts.
- Portal UI uses canonical responsive primitives, status tokens and 44 px interactions with complete loading/empty/stale/offline/403/retry/busy/destructive/confirmed states. Browser QA fixed the truthful offline onboarding count, radio focus-target size and authority-badge contrast before closure.
- Evidence: parsers `7/7`; API `5/5`; Device/Consent pages `17/17`; Web Auth/UI `195/195` in `49` files; Web contracts `88/88`; package contracts `33/33`; TypeScript, ESLint and client/SSR build (`2,525`/`178` modules); CSS `379.82 KB` raw / `59.33 KB` gzip; Chromium `1,128` checks across nineteen routes × three cases; backend check/KLT/workspace/repositories/device-security `41/41`; OpenAPI `81` paths / `412` resolved references; clean diff check.
- Android remains independently native and unchanged. Focused Device/Consent/LiveAudio regression tests pass `59/59` across eight suites; `assembleDebug` succeeds and the APK remains `23,826,433` bytes, SHA-256 `6AF72E75960018E43F074E7AC281C84CE7B6BFDD0378ACCD684B2B12BFEA0DA8`. Platform Admin fleet/OTA stays separate; firmware protocol is unchanged.
- Source/build/local-browser and targeted Android unit/build evidence is closed. Firebase/live/provider/database/deploy, Android runtime/manual accessibility, physical provisioning/command ACK and firmware HIL remain open or `BLOCKED`; no provider or hardware completion is inferred.
- Resume after interruption from this row, the latest handoff and current diff. Continue the original order with Portal Staff/Notifications UI-foundation integration while preserving their closed backend/native lifecycles. Never reopen Devices/Consent or an older row without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Portal Staff and Notifications UI/authority closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Devices/Consent and preserves the previously closed invitation/membership plus native notification/session work.
- TDD and browser reproduction exposed three current defects: Staff/Notifications could stay permanently in a transition after a real workspace change, the Staff endpoint leaked a broader sanitized account projection including Firebase claims into a strict operational contract, and two light-theme text treatments failed contrast.
- Staff and Notifications now use reactive settled-authority keys and operation epochs. Account/workspace changes clear stale dialog, draft and mutation intent state before the exact new authority query is enabled; foreign or late list/mutation outcomes fail closed. Staff parsing requires exact workspace identity, allowlisted roles/statuses and unique member identities.
- Backend `/portal/staff` returns an explicit bounded staff projection with the exact operational membership and no password, Firebase claims, 2FA, session, token or secret material. Shared HTTP v1 publishes its schema/fixture and OpenAPI models. Notification inbox/read/delete and data-only wake-up semantics remain unchanged and backend-confirmed.
- UI uses canonical Web primitives/tokens, responsive layouts, one route heading, 44 px controls and complete loading/empty/offline/permission/retry/busy/unsaved/destructive/confirmed states. The Staff invitation dialog has axe coverage. The authority eyebrow and legacy translucent global `select` rule were corrected without adding another CSS override layer.
- Evidence: focused Staff/Notifications `14/14`; Web Auth/UI `204/204` across `50` files; Web contracts `95/95`; shared contracts `34/34`; TypeScript/lint/client+SSR build; CSS `59.24 KB` gzip plus `1.38 KB` token CSS and fonts about `82.57 KB`; notification browser `66`; unified Chromium `1,374` checks over the `21` routes currently registered in the Portal matrix × three cases; backend check/workspace/staff `7/7`/inbox `8/8`/notification contract; OpenAPI parse/references; backend audit `0`; clean diff check.
- Impact: workspace staff manager and personal inbox owner; Web `/portal/staff` and `/portal/notifications`; Platform Admin retains separate staff/campaign surfaces; Android retains native membership/workspace/Notifications UI and is unchanged; firmware is `N/A`. No migration, notification schema, device protocol or firmware change was introduced. Backend/OpenAPI deploy first; Web may roll back independently through the compatible alias.
- Source/build/local-browser evidence is closed. Firebase/live database/provider/deploy, Android runtime/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`.
- Resume after interruption from this row, the latest handoff and current diff. Every route currently registered in the 21-route Portal matrix is covered; census the remaining RouteContract aliases/details plus Public/Auth/Admin and Android adaptive/runtime evidence, then select the first genuinely open row. Never rebuild this or an older closure without a reproduced regression. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Public Web UI foundation closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This is the first open row selected by the post-Portal route-foundation census; it is additive and does not replace the Phase 0–8 plan.
- The canonical Public shell now owns all `22` Public route contracts, including 404/maintenance. Public pages use Shcare brand assets, semantic light/dark/system tokens, responsive Web composition, 44 px controls and honest product/support/legal copy. Demo glass, glow, gradient text, decorative autoplay/looping media and unverified hotline/customer/metric claims were removed from the Public production path.
- Motion is one-shot, capped, opacity/transform-only and disabled by authoritative system reduced motion. Mobile navigation and reveal behavior retain focus/keyboard semantics. Security tables expose an accessible labelled scroll region, and the Public catch-all remains inside the same shell instead of escaping into a separate demo page.
- Evidence: Pricing regression `240/240`; final RouteContract sweep `5,325/5,325` over `22` routes × `5` viewports × `3` themes; Prettier, TypeScript, focused ESLint, Web contracts `99/99`, and client/SSR build (`2,525`/`178` modules). CSS is `427.56 KB` raw / `63.87 KB` gzip, token CSS is `1.38 KB` gzip and fonts total about `82.57 KB`. The browser gate found no serious/critical axe issue, unexpected console/static/API error, overflow, sub-44 px control, forbidden visual effect, autoplay video or infinite animation.
- Impact: anonymous/public Web users; Public routes only; Android keeps an independent native UI and has no matching Public marketing surface; Platform Admin remains independent; firmware is `N/A`. No backend migration, notification, device, audio or OTA contract changed.
- This closes source/build/local-browser Public foundation only. Contact submission, preview/live/provider, field performance, Android runtime/manual accessibility, physical device and firmware HIL remain separate open or `BLOCKED` evidence. Legacy `signal-horizon.css` and narrowly scoped Public precedence bridges remain visible debt until Auth/Portal CSS consolidation; no claim is made that all old CSS or `!important` rules are gone.
- Resume after interruption from this row, the latest handoff and current diff. Public and older rows stay closed absent a reproduced regression. Continue with Auth shell/RouteContract UI and state coverage, followed by still-open Platform Admin and Android adaptive/runtime evidence. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 — Phase 2 Auth UI/state foundation closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** and the only visible global state remains **Phase 2 in progress**. This row is additive after Public; it does not replace the Phase 0–8 plan or reopen any closed Portal/native slice.
- Census and TDD reproduced four real gaps: `/dat-lai-mat-khau` rendered the forgot-password page, anonymous approval routes invented a pending state, verification copy leaked provider implementation and Auth had no canonical offline state or complete five-viewport browser matrix.
- The dedicated reset page follows the Firebase action-code lifecycle: require and verify `oobCode`, mask the resolved email, validate the new password, confirm through Firebase before success, recover from invalid/expired codes and protect unsaved input. The one-time code is never rendered or persisted by the screen.
- The canonical Auth shell now covers all `15` Auth RouteContract entries with responsive light/dark/system UI, one `h1`, 44 px interactions, reduced-motion-safe bounded transitions and explicit loading/offline/recovery/error states. Anonymous approval and delivery copy now remain truthful.
- Evidence: focused Auth foundation `5/5`; full Auth/UI `211/211` in `51` files; Web contracts `104/104`; TypeScript, focused ESLint and client/SSR build (`2,526`/`179` modules); Chromium `3,615/3,615` checks over `15` routes × `5` viewports × `3` themes (`225` visits); CSS `427.77 KB` raw / `63.89 KB` gzip; token CSS `1.38 KB` gzip; fonts about `82.57 KB`; clean diff check.
- Android remains independently native and unchanged; Platform Admin keeps a separate dense-management UX; firmware is `N/A`. No backend schema, migration, notification, device command, audio or OTA contract changed.
- Source/build/local-browser Auth foundation is closed. Live Firebase action-handler configuration, email delivery, preview/live deployment, provider/database runtime, Android emulator/device/manual accessibility, physical device and firmware HIL remain open or `BLOCKED`; mocked valid-link tests are not provider proof.
- Resume after interruption from this row, the latest handoff and current diff. Keep Public/Auth and every older row closed absent a reproduced regression. Continue Phase 2 with the Platform Admin UI-foundation gap census, then independent Android adaptive/runtime evidence. Deep Security remains untouched at `running/preflight`.

## Phase 2 Platform Admin foundation — source/local-browser closure

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**; global status remains **Phase 2 in progress**. This row continues Auth and does not replace the Phase 0–8 plan.
- TDD reproduced and fixed the current Admin foundation gaps: legacy 2FA mutation, whole-object notification preferences, notification ACK double-submit, inaccessible manual detail drawers, Auth errors without live association, stale default branding, sub-44 px switches/access links, missing brand-font mapping, incomplete reduced motion and the old global `!important` mobile override.
- Canonical Account behavior is now backend-confirmed and owner-bound. Runtime browser proof performs GET 2FA status, GET preferences, one field PATCH with idempotency and ownership checks, then a second PATCH that restores the original value. The UI never reports enabled 2FA without completed enrollment and OTP verification.
- Runtime RouteContract proof now exercises loading, HTTP 503 error, retry, canonical empty and HTTP 403 states. A real limited patient principal is denied on direct `/clinics` navigation before the protected list request. Canonical Radix drawers pass desktop/mobile focus trap, Escape and focus restoration.
- Final source/build gates: Admin contracts `169/169`, ESLint, TypeScript and production client/SSR build (`3,084`/`3,132` modules); backend `check`; notification preferences `18/18`; two-factor `15/15`. CSS is `114.44 KB` raw / `17.95 KB` gzip.
- Chromium passes all `225` route/viewport/theme visits after fixing a reproduced dark semantic error-badge contrast defect. Firefox and WebKit critical mobile/desktop journeys pass after WebKit also exposed a controlled-drawer focus-return race that was fixed in the canonical primitive without weakening the assertion. Aggregate proof is `241` route checks, `19` palette/offline/Account cleanup/drawer checks, `25` representative state checks and `5` direct denials; Axe serious/critical, console/request, overflow, target and reduced-motion gates are clean.
- Independent Android progress in the same Phase 2 track: Clinical Patients/Alerts now share the primary navigation depth and focused motion tests pass. The new 412 dp dark and clinical bottom/rail sources compile but still await runtime proof. Access Log and its date field now have repository/ViewModel, immutable state/action/effect, truthful state coverage, semantic dark/light UI, TalkBack and 48 dp coverage; focused tests pass `10/10`, both debug compilers and `lintDebug` pass. A read-only inventory confirms ten remaining direct-API production screens, preserves already closed Appointment/Device/Notifications/Patients/Alerts work, and selects the one-read-only-dependency Settings overview as the next bounded native migration.
- Restart from this ledger row, `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md`, the current diff and the self-starting Admin browser harness. Preserve Platform Admin and every earlier closure; do not restart Public/Auth/Portal/Admin work without a reproduced regression. Continue Phase 2 from Android Settings/full-gate work. Live/provider/device/firmware evidence and the separately paused Deep Security preflight remain unclaimed.

## Phase 2 Android Settings and bounded clinical status — source/build/local closure

- Governing plan: **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Global status remains **Phase 2 in progress**; this is a durable checkpoint inside that phase.
- Settings closes its authority/capability/logout foundation with exact active-membership gating, locked/deleted-account denial, I/O/5xx-only stale PII, epoch-safe global authority invalidation, authority-clear-first single-flight logout, semantic headings, non-duplicated TalkBack announcements and 48 dp targets.
- Clinical status closes the bounded contract: public health-only status; authenticated doctor/portal status with exact workspace projection; workspace-scoped recording selection; no infrastructure mode in Portal; Android exact-workspace validation and retryable authority acquisition.
- Independent review caught and the implementation fixed six defects before closure: three clinical regressions and three Settings authority/accessibility defects. No cross-tenant clinical-status disclosure was found.
- Backend proof: clinical-status `4/4`, `npm.cmd run check` and `npm.cmd run smoke:workspace-access`. Web proof: contracts `105/105`, TypeScript, ESLint, normal client/SSR build, notification-inbox browser `66/66` and Portal UI-foundation browser `1,374/1,374`. Firebase build is `BLOCKED` by missing six required `VITE_FIREBASE_*` variables.
- Final Android proof: `78` suites, `449/449` tests, main Kotlin compile, AndroidTest Kotlin compile, debug assemble and `lintDebug`; APK `23,906,757` bytes, SHA-256 `D1611B9E51D4E7DBC39DFE4106D307C58641688040E8CC94BA90CB9A56456BDD`. Direct-API production-screen inventory is `9`.
- Runtime/provider evidence remains separate: no `app/google-services.json`, no attached ADB target, and emulator/device/manual TalkBack/golden/FCM/Firebase preview-live/production-signing/hardware/HIL gates remain `BLOCKED`.
- Restart authority is the latest handoff, this row and the current diff. Do not rebuild Settings or the bounded clinical-status contract without a reproduced regression. The next Phase 2 row is **Patient Dashboard authority-bound native foundation**. Full clinical live/stop-scan UI work remains Phase 5. Deep Security remains untouched at `running/preflight`.

## Phase 2 Patient Dashboard — source/build/local closure

- Governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 remain pending; this row is not a Phase 2 completion claim.
- Backend versioned `GET /api/v1/patient/dashboard` purely reads the canonical `activePatientId` persisted by accepted idempotent active-profile PATCH, requires the authenticated owner/account/guardian and exact operational workspace, and scopes all scans and the selected device to that active profile. It does not mutate account, patient, audit or presence state. Cross-workspace, foreign-profile, foreign-scan and foreign-device data fail closed.
- Shared HTTP v1 schema/fixture and OpenAPI publish the same response. Android parsing verifies protocol, account, workspace, patient, scan and device ownership before the ViewModel can expose content.
- Compose now uses repository/domain/ViewModel state and exact authority-epoch binding. The native screen independently covers loading/empty/partial/stale/offline/permission/error/retry, capability-gated typed navigation, backend-confirmed presence, nullable `0%` battery, 48 dp/TalkBack semantics and adaptive 360/412/600/840 dp behavior with large-font one-column fallback. The unproven AI entry point is hidden.
- Proof: backend `smoke:patient-dashboard` `7/7`, workspace-access, `check` and `npm test`; shared contracts `35/35`; Android focused `32/32`, full unit `473/473`, `compileDebugKotlin`, `compileDebugAndroidTestKotlin`, `assembleDebug` and `lintDebug`. APK `24,001,564` bytes, SHA-256 `BDD617D4E175892660720BD9944F0A6055B200DDE5A1FFD792BB1DD45ACC22AE`.
- Runtime proof remains separate and `BLOCKED`: `app/google-services.json` is absent, `adb devices` is empty, and no emulator/golden/manual TalkBack/FCM/live-provider/physical-device/hardware evidence exists.
- Phase 5 retains the clinical P0 migration of `scanIsNormal` in `DashboardScreen`, `MedicalRecordsScreen` and `RecordDetailScreen`; this neutral Patient Dashboard closure does not relabel those legacy screens as complete.
- Resume from this ledger row, the newest handoff and current diff. Keep this and prior closures closed absent a reproduced regression. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains untouched at `running/preflight`.

## Phase 2 Patient Dashboard authority/retry hardening — superseding checkpoint

- Master plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 remain pending.
- Backend active-profile validation is side-effect free until deleted-profile, legal-principal and exact-workspace checks pass. `GET /patient/dashboard` stays pure. Accepted PATCH retries use exact receipts; legacy ID-only receipts are safely upgraded only when the current row still matches and otherwise fail with stable `409 IDEMPOTENT_ACCOUNT_RESULT_STALE_LEGACY`.
- Closed patient/scan/device DTOs and Android exact-type validation prevent provider/private fields, foreign identity, string/boolean coercion and invalid telemetry from reaching UI state.
- Android retry authority keeps one idempotency key through recoverable failures. A backend-confirmed profile switch verifies the exact account, Firebase identity, workspace, principal and patient, advances the subject epoch and invalidates old-profile back-stack PHI.
- Fresh gates: backend Patient Dashboard `9/9`, workspace-access, check, full smoke and repositories pass; shared contracts `35/35`; Android focused `62/62`, full unit `487/487`, both Kotlin compilers, AndroidTest compile, assemble and lint pass. APK is `24,018,920` bytes, SHA-256 `751A9CDACB18B18D19C8CE88116D24B664451495FDFF2AC68EBD5BD9CF311C20`.
- Source/build/local proof is closed. Firebase runtime, emulator/device, manual TalkBack/golden, provider/live, physical-device and hardware proof remain `BLOCKED` because `google-services.json` and an ADB target are absent. Phase 5 retains the three-screen `scanIsNormal` migration.
- Restart authority is this row, the newest handoff, current diff and latest generated test/APK artifacts in the canonical worktree. Do not repeat a closed row without a reproduced regression. Inventory the next genuinely open Phase 2 native row before editing. Deep Security remains untouched at `running/preflight`.

## Phase 2 account password contract — in-progress restart row

- Master plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 are pending. This row continues the prior Patient Dashboard checkpoint and does not reopen it.
- Target contract: client reauthentication only; backend-owned password mutation; required stable `Idempotency-Key`; exact untrimmed secrets; active account/workspace authority checks; exact `{ok,user,provider,operationId,replayed}` receipt; no local/provider success before that receipt; logout only after confirmation.
- Android implementation and focused TDD are present. Route authority is frozen by user/workspace/capability/epoch and checked before reauthentication, before mutation and after receipt. Recoverable retry keeps one operation key, stale authority clears secrets and cannot log out a replacement account, and the Compose screen uses its own native layout/state/accessibility implementation.
- Narrow evidence: `20/20` focused Android tests pass after correcting the new JUnit blank-key test to return `Unit`. Backend and Web integration are still being completed in parallel; no full build, APK hash, provider/runtime or completion claim exists for this row yet.
- On interruption, resume from this row plus the newest handoff/current diff/test output. Finish backend/Web contract parity, then run the integrated backend, Web and full Android gates and update all canonical handoff documents. Do not recreate or re-audit closed rows without a reproduced regression. Deep Security stays untouched at `running/preflight`.

## Phase 2 account password contract — source/build/local closure

- Master plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 are pending. This supersedes the in-progress password row without completing the phase.
- Contract is closed across shared schemas/fixtures, backend, Portal, Platform Admin and Android: one client reauthentication, one backend-owned mutation, exact secrets, one stable required idempotency key, account/workspace/capability/epoch checks, exact minimal receipt, no optimistic success and logout only for the confirmed receipt owner.
- Backend uses a keyed sensitive fingerprint, durable provider-operation state and transactional audit/notification/account finalization. A replay cannot call the provider twice. An uncertain applying window requires reconciliation. A Firebase account disappearing between current-password proof and provider update is not success: `reset_password` now requires `updated: true`.
- Web authentication cleanup is UID/token/attempt-owner aware across concurrent login, auth-state callbacks and sign-out. Platform Admin consumes the same receipt but preserves its own dense UI. Android preserves native layout, IME/inset/TalkBack/48 dp behavior and validates authority before/during/after mutation and recovery; a stale operation cannot clear or sign out a replacement account.
- Final gates: backend Firebase/password `22/22`, check, full smoke, repositories, workspace-access, KLT contract; shared contracts `29/29`; Web Auth/UI `227/227` in 52 files, contracts `105/105`, lint, client+SSR build, Portal browser `1,374/1,374`; Admin contracts `175/175`, lint, client+SSR build and targeted desktop-dark `/account`; Android `86` suites / `518/518`, main/AndroidTest Kotlin compilation, assemble and lint.
- APK: `24,066,508` bytes; SHA-256 `5DC07A7E02A0F97FB62C80FBD1201EDBE5E3E2174F71F335FBCA053917DE9FD0`.
- Runtime evidence is not inferred. `google-services.json` is absent and ADB has no target; live Firebase/PostgreSQL/provider, full Admin matrix, emulator/device/manual accessibility, production signing, physical device and firmware HIL remain open or `BLOCKED`.
- Restart authority is this row, the newest handoff, current diff and latest generated test/APK artifacts. Keep this and all prior closures closed unless a regression is reproduced. Inventory the seven explicit direct-API Android screens and select the smallest non-Phase-5 native foundation row next. Deep Security remains separately untouched at `running/preflight`.

## 2026-07-30 — Phase 2 active checkpoint: email verification and role request

- Master plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. User-visible status is Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending.
- Last closed row is the account-password source/build/local workflow. It and all earlier rows remain closed unless a current narrow test reproduces a regression.
- Active row: Android registration → email verification with owner/session-bound native state and the matching Web/backend/shared role-request contract. Clinical Dashboard/Live/Records/New Scan remains reserved for Phase 5.
- Completed so far: typed Android verify-email route plus focused tests; Web role-request intent/receipt parser, stable idempotency key, canonical v1 endpoint, owner checks and conditional token cleanup; Approval Pending stable-key retry and foreign-account receipt denial; focused Web tests `14/14` and TypeScript `--noEmit`.
- Open work: backend/shared exact receipt, idempotency and account/audit/notification ownership; Android repository/ViewModel and pending-registration binding; native screen/resources and Doctor Approval compatibility; integrated gates, APK hash, review and seven-document closure.
- `SMART_HEALTH_ACTIVE_CHECKPOINT.md` is the mutable first-read pointer for interruptions. The newest context/ledger rows preserve closed proof. Quota exhaustion, compaction, task restart or power loss never authorizes reimplementation by itself.

## 2026-08-01 — Phase 2 registration/email-verification/role-request source/build/local closure

- Master plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 remain pending. This row supersedes the 2026-07-30 active checkpoint without completing the phase.
- Web binds doctor/clinic registration, approval and document retry to exact Firebase/backend ownership, canonical workspace, intent fingerprint and file byte identity. A→B→A replacement cannot inherit a bearer, receipt, success or cleanup; Approval Pending proves the current bearer through authenticated `me()` before mutation.
- Backend/shared role requests are tenant-scoped, idempotent and auditable. Patient self-enrollment into an arbitrary clinic is denied; document upload is capped at 10 MiB during streaming; migrated object keys require the exact org/user prefix. Unique 96-bit attempt keys and exact ledger ownership prevent both precommit orphans and loser cleanup deleting a committed concurrent winner.
- Android uses native repository/ViewModel/state/effect flows. Email Verification and Doctor Approval require one exact active operational workspace/membership; notification ACK parsing rejects coercive JSON; logout/unregister pins account A authority and cannot clear account B during paused network work.
- Web proof: Auth/UI `288/288` in 57 files, contracts `105/105`, local TypeScript, ESLint, client+SSR build, CSS `63.89 KB` gzip. Backend proof: role-document `13/13`, shared `38/38`, check/base/isolated workspace/repositories/diff. Android proof: focused `40/40`, full `579/579` in 93 suites, compile/AndroidTest compile/assemble/lint and clean diff.
- APK is `24,123,768` bytes; SHA-256 `C0230EB545E4BFA34D9EE68857CC0FE9C6C1C2217783F3874557F08E338FE7E6`. Independent final reviews found no remaining P0/P1 in the reviewed changed scope.
- Provider/runtime proof is not inferred. Missing `DATABASE_URL`, `google-services.json` and an ADB target keep live PostgreSQL/Firebase/FCM, emulator/device/manual accessibility, production signing and physical-device/HIL evidence open or `BLOCKED`. Deep Security remains separately `running/preflight`.
- Restart from the active checkpoint, this newest ledger row, newest handoff and current diff/proof. Keep this row closed absent a reproduced regression. The direct-API inventory selects **Doctor Approval architecture-bound native foundation** as the next Phase 2 row; SignUp follows, and the four clinical/audio screens stay in Phase 5.

## 2026-08-02 — Phase 2 Doctor Approval source/build/local closure

- Master plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 remain pending.
- Android moves Doctor Approval out of the direct-API production-screen boundary into repository/domain/ViewModel ownership with immutable state/action/effect, lifecycle-aware collection, native accessibility/insets and operation-wide input freezing.
- Authority is four-dimensional: Firebase user, backend user, current operational workspace and requested target workspace. Nonterminal requests keep patient authority in current personal workspace; approved transitions require exact target/current convergence and active doctor membership. Saved drafts and retry keys bind all four identities.
- Email Verification consumes the same contract. Doctor Approval logout pins UID+email+Firebase session epoch, preventing both missed pending-session teardown and same-UID ABA replacement logout.
- Backend denies target drift through role replay, Admin approval payload, `/me` workspace selection and active-profile selection; avoids ghost patient creation in the requested clinic; and returns/replays the post-membership canonical approval snapshot.
- RED evidence reproduced Admin Alpha→Beta approval, pending target PATCH drift, active-profile target drift, personal→clinic Android rejection, pending logout leakage and Firebase A→B→A logout. All were converted to regression coverage before GREEN.
- Final gates: shared `31/31`; backend workspace-access/check/test/repositories; Android `611/611` in `95` suites, AndroidTest compile, assemble, lint and targeted diff check. APK `25,552,231` bytes, SHA-256 `84D99052B50E91282589F81DF94BDCC8BFF606CD410BC6E4CC84132364B216FA`. Independent final reviews found no bounded P0/P1.
- `google-services.json`, ADB device and live provider/database proof remain absent or `BLOCKED`. Record P2 debt separately: migrate doctor-request target away from dual-purpose `organizationId`, make the approval saga atomic, and revisit rejected-request target lock UX.
- Restart authority is the active checkpoint, newest handoff, this row and current proof. Doctor Approval stays closed absent a reproduced regression. Continue Phase 2 with **Android SignUp architecture-bound native foundation**; do not pull Phase 5 clinical/audio work forward. Deep Security remains untouched at `running/preflight`.

## 2026-08-02 — Phase 2 Android auth/session owner hardening source/build/local closure

- Master plan vẫn là **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 đã hoàn tất, **Phase 2 vẫn đang thực hiện**, Phase 3–8 còn pending. Hàng này supersede checkpoint auth/session hiện hành mà không viết lại lịch sử hoặc đóng Phase 2.
- `FirebaseOwnerBinding` chính xác đã được nối xuyên Splash, Login, SignUp, Verify và Doctor. RED/review đóng đúng năm P1: Verify recapture, Doctor ABA owner, stale termination replacement, reauthorization global clear và workspace/profile stale global teardown.
- Workspace/profile confirmation yêu cầu exact `MobileSessionAuthority` snapshot và từ chối same-identity/new-epoch. `AppNav` không còn global `authorityStore.clear()` hay `SmartHealthSessionTerminator.terminate()`.
- Review độc lập cuối cùng: P0 không, P1 không, P2 không trong các đường đã sửa. P2 riêng vẫn mở: partial SignUp abandonment/back có thể để Firebase owner trên public Login.
- Full Android unit: `98` suites / `655` tests; failures `0`, errors `0`, skipped `0`. `:app:compileDebugAndroidTestKotlin :app:assembleDebug :app:lintDebug --rerun-tasks` `BUILD SUCCESSFUL` trong `4m43s`, `56` tasks. Lint `43` warnings / `0` errors và `0` auth/session issue trong phạm vi; `git diff --check -- smart-health-android` sạch.
- APK debug `24,172,920` bytes; SHA-256 `CEB6BFC23995B361AD0BD23B24F4F836E0464BCB215105C8A6EDE8BACDAC5F69`.
- Runtime không được suy ra: thiếu `app/google-services.json`, ADB trống, nên Firebase/provider/navigation trên emulator hoặc thiết bị thật vẫn `BLOCKED`.
- Restart authority là active checkpoint, handoff này, ledger row này và diff/proof hiện tại. Tiếp tục bằng kiểm toán hoàn tất Phase 2 foundation trên Web foundation và Android native foundation; không kéo Dashboard/Live/Medical Records/New Scan/audio từ Phase 5 lên trước. Deep Security không bị chạm tới.

## 2026-08-02 — Phase 2 Web CSS A + Android adaptive foundation source/build/local closure

- Master plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending.
- Web RED/review found mobile title loss, residual Portal glass, semantic heading loss, import-parser bypass and a weak `!important` budget. GREEN restores `h1`, keeps compact title visible, removes active Portal backdrop blur, parses case/comment/quoted/unquoted imports and pins the `1,839` remaining declarations with count + SHA-256 multiset.
- Web proof: focused `7/7`; full contracts `112/112`; direct TypeScript, Vite build and ESLint pass; scoped diff check clean; Chromium Portal `1,374` checks (`21` routes × `3` cases) and Public `5,325` checks (`22` routes × `5` viewports × `3` themes) pass. Firefox/WebKit critical, visual snapshot and performance proof are not claimed.
- Android RED/review found system Back escape, fractional breakpoint activation, missing selected semantics, weak interaction coverage and large-font label risk. GREEN adds float boundaries, BackHandler, selected semantics, two-line labels and end-to-end instrumentation source coverage around the reusable list/detail shell.
- Android proof: `99` suites / `660` tests, failures/errors/skipped `0`; AndroidTest compile, assemble and lint pass in `5m11s`; lint `43` warnings / `0` errors. APK `24,172,920` bytes, SHA-256 `AF2E8648AF12B2F360B1AE2FA7DEC59386C52872185D4605001BC353F800F66B`.
- Runtime remains separate: no Firebase config or ADB target, so device Espresso/manual TalkBack/FCM/provider proof is `BLOCKED`; large-font navigation still needs geometry/golden proof. Keep CSS debt, Android resource/deep-link/testTag and SignUp abandonment/back open. Phase 5 clinical/audio work stays deferred.

## 2026-08-06 — Phase 2 closure audit correction

- Global phase map remains Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending. A Phase cannot be marked complete while known obligations assigned to it remain.
- Independent Web exit: no P0/P1; foundation `27/27`, contracts `114/114`, Auth/component `288/288`, TypeScript `11.1s`, ESLint and Vite client+SSR pass; CSS `62.10 kB gzip`, fonts `82,572 bytes`.
- Cross-browser: Portal Chromium `459`, Firefox `458`, WebKit `459` checks over 21 routes per selected case; Public Firefox phone and WebKit desktop critical routes pass `16` checks each. WebKit Blob-body observation was moved to the browser `fetch` seam while headers remain network-checked.
- Independent Android exit: no P0/P1; foundation `5` suites / `32` tests, main Kotlin and AndroidTest Kotlin compile, targeted diff check pass.
- Runtime/provider/device remains `BLOCKED`; CSS/bundle/visual and Android resource/testTag/deep-link/golden/SignUp obligations keep Phase 2 open.
- A canonical session revocation receipt slice was started early before this status correction. Finish its already in-flight backend/Web/Android integration, then return to Phase 2; it does not advance the official Phase.

## 2026-08-15 — Phase 4 software/source-build closure; Phase 5 opened

- Governing source remains **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–4 are closed only at the software/source/build/local boundary; Phase 5 is active and the overall plan is not PASS.
- Final Phase 4 backend review found and closed one P1: private firmware GET could outlive an unacknowledged command's delivery TTL. The handler now refreshes the exact command under ownership→OTA→command lock/CAS, atomically expires OTA+command and revokes `tokenHash`, and allows execution TTL only after ACK. JSON/PostgreSQL rollback cases pass.
- Exit evidence: backend check; OTA/repository `24/24`; private HTTP `8/8`; ownership/storage `67/67`; scoped diff-check clean. Earlier exclusive convergence evidence remains storage `3/3`, device `71/71`, ownership parity `64/64`, repositories PASS and shared `47/47`.
- Android Phase 4: `109` suites / `793` tests, assemble/lint PASS, APK SHA-256 `DCEEEC05251FAE3AD475F5C1F4B41CA6D43E9728AC68C961553E57F9BAF47B34`; Firebase/ADB runtime is `BLOCKED`.
- Firmware Phase 4: source contract and production/OTA builds PASS; RAM `52,864 / 327,680`, flash `1,120,489 / 6,291,456`; Phase-4 binary hashes are `3153F65239F9F7D9859DB2F4473AB5D879E907A4FC410E0E1CEDFE8EC0FBA582` and `2E0BF2A5440FED1FEFEDCB1DA7C6E6531FF7925B011E61293508267C48AE119B`.
- Native firmware runtime lacks `gcc/g++`; flash/provision/audio/forced-rollback HIL is `DEFERRED — chờ phần cứng`. Deep Security was not touched and remains `running/preflight`.
- Phase 5 RED inventory: audio v2 schema/wire mismatch; missing finalize-before-stop-ACK; `audio.failed` not interrupting; missing exact start/stop idempotency; restart strands `created`; Android live/record direct API/runtime boundaries. Current `77/82` device-security result is this intentional RED state, not a Phase 4 regression.

## 2026-08-22 — Phase 5 software/source/build/local closure; Phase 6 opened

- Governing plan is **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. The five Phase-5 RED regressions are fixed; Phase 0–5 are closed only at software/source/build/local gates. Phase 6 is active; the overall plan is not PASS.
- Backend exit: device-security `82/82`; clinical workflow `8/8`; clinical dashboard status `4/4`; audio protocol `4/4`; audio processing worker `6/6`.
- Web/Portal exit: six clinical/live suites `28/28`; live-audio/clinical contracts `12/12`; direct local TypeScript, ESLint and Vite client+SSR build PASS; CSS `60.58 kB gzip`.
- Android exit: native review queue/decision flow added with independent mobile UI, capability/authority gating, exact idempotency/version receipt and full state coverage; `116` suites / `830` tests, AndroidTest compile, assemble and lint PASS. APK `26,948,657` bytes, SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`.
- Firmware audio-v2 source/build remains PASS; binary `1,121,328` bytes, SHA-256 `CC53E0084BB699BC4787FC10DD20E1AFEC3454E46A05286DE61B56671F357EF6`. Physical HIL stays `DEFERRED — chờ phần cứng`; Firebase/provider/ADB stays `BLOCKED`; Deep Security remains untouched at `running/preflight`.
- Phase 6 begins with cross-surface appointment/consent/alert/notification impact inventory and closes actionable software gaps before any phase transition.

## 2026-08-22 — Phase 6 software/source/build/local closure; Phase 7 opened

- Governing plan remains **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–6 are closed only at software/source/build/local gates; Phase 7 is active; the overall plan is not PASS.
- Phase 6 RED/GREEN closure: the former hard-delete appointment path was replaced by additive migration `054_appointment_soft_delete.sql`, repository tombstones, active-query filtering, exact idempotent DELETE receipts, tenant/capability denial and audit in the same transaction. Portal exposes a destructive confirmation and only reports success after validating the backend receipt; retry reuses the original intent key.
- Exit proof: shared contracts `49/49`; backend check/workspace/repository plus notification preference `18/18`, push `9/9` and campaign `8/8`; Portal focused contract/component plus direct TypeScript/lint/client+SSR build; Admin `183/183` plus lint/build; Android `116` suites / `830` tests plus AndroidTest compile/assemble/lint. Targeted diff-check is clean.
- Android debug APK SHA-256 remains `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`. No Android production source changed in the final appointment deletion slice.
- Phase 7 starts with a real-data/truthfulness audit of all remaining Admin surfaces. Firebase/provider/ADB stays `BLOCKED`; physical HIL stays `DEFERRED — chờ phần cứng`; Deep Security stays separate at `running/preflight`.

## 2026-08-22 — Phase 7 software/source/build/local closure; Phase 8 opened

- Governing plan remains **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–7 are closed only at software/source/build/local gates; Phase 8 is active and the overall plan is not yet PASS.
- Reproduced Phase 7 gap: Patients, Doctors, Devices, Packages and Storage downloaded full ledgers and filtered or paged locally; package workspace assignment could be undercounted from a paged Clinics response. The fix introduces a shared backend list contract with bounded `q/page/limit/sort`, stable ID tie-breaking, strict invalid-input errors, legacy body compatibility and pagination headers.
- Backend-authoritative facets/summaries now prevent current-page counts from being presented as platform totals. Every migrated Admin screen aborts stale requests, clamps out-of-range pages and uses server totals while preserving loading/error/retry/permission/destructive states.
- Exit proof: shared contracts `50/50`; backend check, admin-list `3/3`, workspace-access and repositories PASS; Admin contracts `185/185`, ESLint and Vite client+SSR build PASS; whitespace diff check clean. Expected provider-unavailable negative-path output in workspace smoke is not a failed gate.
- Phase 8 starts with RC/demo inventory and candidate proof. Firebase/provider/ADB stays `BLOCKED`; physical HIL stays `DEFERRED — chờ phần cứng`; Deep Security remains untouched at `running/preflight`.

## 2026-08-22 — Phase 8 RC2 demo and artifact checkpoint

- Added `web-monitor/scripts/startShcareDemo.mjs` and `demo:stack`. The launcher uses isolated JSON data and local-demo auth, starts backend/audio/Web/Admin on `3765/3766/8765/8766`, waits readiness, prints bounded demo credentials and performs deterministic Ctrl+C cleanup. A real run returned HTTP 200, passed Admin and Portal doctor logins, released every port and removed the temporary directory.
- Fixed the Admin skip-link target from 32px to at least 44px. The rerun passed 72 route/viewport/theme checks, patient create/update/delete, notification mutations, audit metadata, CSV download and cleanup with zero axe serious/critical, console/request error, overflow/theme/provider drift or undersized target.
- Updated firmware release identity to `1.0.1` so OTA anti-downgrade can distinguish RC2. Production and OTA PlatformIO builds passed; exact binary hashes are recorded in the RC2 manifest. Hardware proof remains deferred.
- Applied compatible dependency remediation. Backend audit is zero; Web Bun audit is zero; Admin has no high/critical and retains one low development-only `tsx/esbuild` advisory. All affected tests, type/lint and builds passed after lockfile changes.
- Final local aggregates: Web `390/390 + 123/123`; Admin `186/186`; shared contracts `50/50`; backend check/base/KLT/admin-list/workspace/repositories; Android retained `116/830`; firmware `1.0.1` production/OTA. Final Web/Admin dist, APK and firmware artifact hashes are bound in [SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md](SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md).
- Phase 8 remains active. Missing Firebase/public HTTPS/PostgreSQL/S3/secrets/providers/OTA signing and Android runtime/signing are release blockers; physical HIL is `DEFERRED — chờ phần cứng`; Deep Security remains independent at `running/preflight`.
- Firefox/WebKit RC2 evidence then closed locally. Public representative checks passed `16 + 16`; Portal passed `463 + 463` checks over 21 routes per engine. The initial WebKit run reproduced an unmocked `/api/v1/me/avatar/cleanup` 404; the harness now returns the exact owner/workspace-bound `not_required` contract and the focused/full reruns are green. Product-source revision: `7fd905ff91208bab0d855b1ae2d15bdb5a32c3ad`.
- Local production-preview performance passed with load `113ms`, transfer `346,058` bytes, JS `200,809` bytes, LCP `400ms`, INP `56ms` and CLS `0.0003938633`. Field telemetry remains an external deploy gate.

## 2026-08-23 — Phase 8 release-source gate refresh

- Reproduced a clean-clone release failure in `smoke:identity-migrations`: it read ignored runtime state from `data/db.json` and failed with `ENOENT`. Replaced that dependency with a committed synthetic fixture and confirmed identity migration smoke, aggregate backend check and base test all pass.
- Current verified product-source revision is `c1933d979db69ae8bc105489d1accdec9bfd0fe5`. Fresh backend domain gates, shared contracts `50/50`, Web type/lint/contracts/build, Admin lint/contracts/build, Android unit/compile/AndroidTest compile/lint/debug APK and firmware source/production/OTA builds pass.
- Created and checked an isolated detached candidate worktree; the governing plan required an explicit sparse-checkout add before materializing locally, while the Git object was always present. Remote branch push authorization passes in dry-run.
- Phase 8 remains active: push/PR and Firebase preview are next. Backend/main/live promotion is gated by Render start mode, migrations `044–054`, storage/provider/CORS, backup/rollback and cleanup-safe live proof. Android signing/current device proof, OTA signing/canary and Deep Security remain open. Physical HIL remains deferred by the user rule.

## 2026-08-24 — Integration addendum G3 firmware and dual-mic HIL closure

- Governing addendum is [Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md). G0–G2 remain closed; G3 is active; G4 pending.
- Additive dual-slot plus capture-queue telemetry is bounded and contract-aligned. Evidence: shared `51/51`, device-security `82/82`, backend check and scoped diff-check PASS.
- Firmware capture is isolated from network blocking by a dedicated FreeRTOS I2S/DSP task and static eight-frame zero-wait queue. Generation/ordinal/session fences, discontinuity/drop/stale accounting and OTA pause ACK are present. Production connect/I/O/TLS timeouts are one second.
- Independent review reproduced and closed the last P1: ArduinoWebsockets could report success after a partial transport write. The custom production transport now verifies exact `client.write` bytes; only full writes increment `wsPacketsSent`, while partial writes close/reset the authenticated audio session. Final review reports no P0/P1; diagnostic snapshot skew is P2.
- Four source contracts and production/development/OTA builds PASS. Production image is `1,124,704` bytes, SHA-256 `A31F9F6B32AF05F253AEB5D00063F8BA0318D6C9965CB0F9EE01B9CB02E54004`; OTA SHA-256 is `ECB97D1D56561D954425365CF15E7FE35F3A7C26BDC65B659196FFB028A3A9E1`.
- Final wired flash succeeded with hash verification. Controlled boot HIL captured `63/63` non-zero RMS/peak reports for both physical mic slots, built five-second watchdog and I2S readiness, with no degraded/unavailable/reboot marker; an additional stable capture produced `82/82` non-zero reports per slot.
- Production WSS/auth/command ACK/forced OTA rollback remains BLOCKED by encrypted-NVS/device-credential/CA provisioning. Deep Security plugin/tool/context are available, but its coordinator correctly rejected this thread's `permission_profile=disabled`; read-only workers require a host-managed profile. Durable scan `1b48646c-c3fe-4835-9526-92177be380ae` remains `running/preflight`; it was not replaced, completed, failed or cancelled. Switch the composer from `Full access` to `Ask for approval`, send a new turn and resume the same scan. Candidate SHA freeze follows successful completion.

## 2026-08-24 — G3 Deep Security and regression-gate closure

- Durable scan `1b48646c-c3fe-4835-9526-92177be380ae` completed and sealed with `8` findings. Canonical artifacts are under the workflow-owned scan directory; the scan must not be recreated or rerun as a replacement.
- Closed confirmed paths: production demo-auth default, tenant webhook SSRF/redirects, public JSON memory amplification and spoofed forwarding headers, unbounded notification-device ownership/fan-out, Android exported-intent replay, and PHI persistence for confirmed runtime/patient/scan/AI sinks. Public recording status and retry-time notification authorization were revalidated as already safe.
- Regression gates pass: security release gate `4/4`, notification-device concurrency/cap tests, PHI persistence/backfill `4/4`, Android notification contracts, backend aggregate/domain smokes, Web/Admin build gates, Android `831/831`, and firmware production/development builds. Native PlatformIO host tests remain environment-blocked because host `gcc/g++` is absent.
- Base HEAD is `1c902b29405717c28d8dfa908e4eeb16137971cc`; intentional dirty snapshot hash is `dc3e7457f923ddb2483e9e12aff0a6205d58aff5`. G3 remains active pending browser smoke, production/provider preflight and candidate manifest freeze; G4 remains pending.

## 2026-08-24 — G3 Hosting backup/preview and Auth CSS production regression

- Exact allowlist staging produced integration checkpoint `9a4855a4f286b77c35470dfc92e269a6504ef111`; `103` paths were staged intentionally, `93` text paths passed the bounded secret-pattern scan, and no unrelated `.gstack` output was staged. The branch and immutable `shcare-v1.0.0-rc.2-g3` tag were pushed.
- Independent Firebase backup channels were created before previews. Web and Admin candidate preview deploys succeeded; no live promotion occurred.
- Preview QA reproduced one production-minifier-only Auth regression: legacy `backdrop-filter: blur(16px|18px)` survived while a later standard `none` declaration was dropped. Canonical `signal-horizon.css` now owns both standard and WebKit `none`; contracts/build and preview checks pass under light/dark/system at 360 px. Fix revision is `927b171132d834acfe6a52bb7f3ab7e6e6d7189a`.
- Anonymous Admin `/storage` proves protected routing to `/login` with no overflow/console error; authorization/menu visibility remains covered by the capability contract. Authenticated preview operation remains blocked because the old backend responds to both preview origins with the Admin live CORS origin.
- G3 remains open for atomic backend CORS/config/migration readiness, authenticated preview cleanup smoke and production secure-device WSS/ACK/OTA proof. G4 has not started.

## 2026-08-24 — G3 Android/ESP local Wi-Fi provisioning checkpoint

- Commit `bb8b5f4ea31e5ff6c798007d70cf1ef2dcc372a5` (core provisioning parent `6a28fe2b431ffae5bb9d62d26d712136359f3bd9`) replaces the manual JSON/development-flag setup expectation with a real product flow. Android uses `WifiNetworkSpecifier`, version-aware nearby-Wi-Fi permissions and a network-scoped raw socket; ESP exposes bounded device/session/CSRF-bound JSON setup endpoints. Backend online polling begins only after ESP returns HTTP `202`. Automatic setup is primary; manual credentials/browser controls are collapsed by default.
- Android exit: `117` suites / `838/838`, failures/errors/skipped `0`; full unit, compile, AndroidTest compile, assemble and lint pass, lint says `No issues found`. APK: `26,954,873` bytes, SHA-256 `2D33500435F0B7A7A2851648D1672D6973CE3263AE2800828E4063CB61EBFFDB`.
- Firmware exit: physical ESP Unity `54/54`; production build `1,130,768` bytes, SHA-256 `5B61DDAD78613DEB6A1EB4ECFF1C2035C791666838057D5EC71AFC01551EC828`; HIL application restored on COM9. Captive Web HIL passes Shcare HTML, exact session binding and invalid-CSRF denial, and restores the host Wi-Fi.
- Final serial proof after restore confirms I2S ready, setup recovery server/portal/AP and non-zero RMS for both mic slots. Runtime App remains blocked only because ADB has no device; success with the actual target Wi-Fi is intentionally waiting for a password entered by the user. G3 remains in progress and G4 pending.

## 2026-08-25 — G3 attached-device install and local Admin authentication

- Installed the integrated-demo APK on the attached Xiaomi and verified Firebase-emulator/backend patient login reaches the real Patient Dashboard with `1/1` Compose instrumentation proof. MIUI denies ADB shell input injection; QR/Wi-Fi remains a physical/Compose interaction, not a source failure.
- Added the reproducible local-only Admin alias `admin / admin` to the demo launcher. A real browser login returned backend HTTP `200`, reached `/` and produced zero console errors. Removed the pre-existing fake development success fallback.
- Focused Admin auth contracts pass `2/2`; Admin lint and build pass; the demo launcher passes `node --check`. G3 remains open for user-entered target Wi-Fi and authenticated WSS/ACK/audio-v2/durable-scan/OTA runtime evidence. G4 remains pending.

## 2026-08-25 — G3 physical QR foreground race remediation

- Reproduced on Xiaomi: scanner return overlapped foreground reauthorization, temporarily returning no current authority after the backend had already committed the correct device claim. UI incorrectly emitted the expired-session state.
- Remediation is bounded and fail-closed: wait only for the exact expected authority; recover an already-consumed claim only from an authenticated list receipt matching device id, workspace id and owner user id. Cross-owner recovery is denied and setup proof is cleared.
- Focused Device Pairing tests and integrated-demo assemble pass. APK `8AC6BF2942DEDD07425324092314B9F06CAAC2D21408C7F85E499E93B4A3DDF2` is installed on Xiaomi. Physical rescan and target-Wi-Fi/WSS chain remain open; no G3 completion is claimed.

## 2026-08-25 — G3 current-network prefill and physical AP checkpoint

- Added Android current-SSID acquisition with API-aware permission/fallback handling, platform quote/redaction normalization, one-time ViewModel prefill, protection for user-edited SSIDs and native status/retry UI. Fine location is requested only for the current-network metadata; local ESP setup still uses nearby-Wi-Fi permission and manual SSID remains functional if location is denied.
- Regression proof is `118` suites / `849/849`, AndroidTest compile, integrated-demo assemble and lint PASS. APK `26,959,593` bytes / SHA-256 `D1309E2C1793717453DE5610EFE4824A589EFD69FEFA819F58F980E888DC53FF` is installed on the attached Xiaomi.
- Physical diagnosis: the earlier `WifiNetworkSpecifier.onUnavailable` was captured while no matching AP was visible. COM9 reset now proves application firmware, exact QR/AP SSID parity, local setup service and non-zero activity from both I2S slots. MIUI denies ADB shell and UiAutomation permission/input injection; the gated current-SSID device test is intentionally not counted as PASS until the user approves the normal App permission.
- Resume with physical QR scan and on-device password entry, then require authenticated WSS presence, command ACK, audio-v2, durable scan and signed OTA rollback. G3 remains active and G4 pending.
## 2026-08-25 — G3 Xiaomi SSID/loading checkpoint

- Scope: chỉ sửa regression Android Device Pairing và periodic route loading; không mở lại G0–G2.
- Root cause proof: Xiaomi có Wi-Fi đang kết nối nhưng Location services OFF nên platform redacts SSID; `AuthorizedMobileRoute` có TTL timer 30 giây dựng full-screen reauthorization.
- Implemented: `LocationDisabled` + native Location settings recovery + refresh-on-return; bỏ timer giữa cùng route, giữ các gate fail-closed ở foreground/route/session/workspace/backend.
- Gate: JVM `118` suites / `850/850`, AndroidTest compile, lint, assemble PASS; APK `26,961,117` bytes, SHA-256 `E4A1ECDACF98ED6DB32B4B248D7152EC38B7C47383E54DF524A5171840159D0B`, installed Xiaomi.
- Open: secure-unlock Xiaomi → approve Location in App → runtime Compose/SSID HIL → QR provisioning → WSS/ACK/audio-v2/durable scan/OTA rollback. No secret persisted or logged.

## 2026-08-25 — G3 BLE-first pairing correction

- Replaced the accidental primary setup-AP journey with `QR/manual claim -> paired/offline -> separate BLE Wi-Fi action`. AP is an explicit physical recovery route only.
- Added opaque scan filtering, identity verification, nonce-bound AES-GCM payload, bounded parser, acknowledgement gate and reboot. Android waits for backend presence before online.
- PASS: Android JVM `119/857`, lint/assemble, and firmware development/production builds. Development firmware flashed on COM9 reports BLE ready, offline/no-WSS and two active microphones.
- BLOCKED: App server connection and unavailable Windows Bluetooth (`0x800710DF`) prevent a full authenticated BLE HIL. G3 remains open; G4 pending.

## 2026-09-06 — Takeover ledger: mic-quality warning slice (Codex session 01a039de → Claude)

- Context: Codex session `01a039de` (25/08–06/09) stopped ~01:29 UTC on 06/09 mid-task. Its final slice — Android white-theme + pill-composer remake, firmware DSP overhaul (heart 25–250 Hz / lung 80–2000 Hz, slot-signal classification, AGC gated on biological signal), `audioSignalQuality` telemetry and Gradle wrapper bump — remained uncommitted; last pushed commit `07410e5c`.
- Implemented (takeover slice): Android parses `audioSignalQuality` end-to-end (`SmartDeviceTelemetry` → `parseSmartDeviceTelemetry` → `DeviceHealthSnapshot.audioSignalQualityKind`) and the device health panel renders a warning notice + metric for `too_weak`/`clipped`; `detected`/unknown render no notice. Advisory-only: presence/online status is unaffected.
- Gates: `:app:testDebugUnitTest` `893/893` PASS (new `DeviceHealthSnapshotTest` cases 4), `:app:compileDebugAndroidTestKotlin` PASS (new `DeviceHealthPanelTest` cases 2, physical run pending), `assembleDebug` PASS (debug APK `48,795,198` bytes, SHA-256 `2D7BBAE331EFEDE1EADA492A5C63218E4C0E8601D7B60D9A56C607A1533630B6`, not installed), `lintDebug` PASS with `0` errors/`0` warnings.
- Open: commit dirty slices (never `git add -A`), physical panel proof on Xiaomi, slot-1 Right mic hardware repair, Wi-Fi re-provisioning via App secure field, approved AI provider, signed OTA/rollback. Software now reports the weak signal truthfully; the blocker is physical.

## 2026-09-06 — Continuation ledger: Claude takeover → Codex

- Reconciled the pasted Claude transcript with Git and retained all six focused commits. Closed its interrupted Compose assertion without touching unrelated untracked user files; added the omitted `AIAssistantComposerContractTest` to the continuation slice.
- Android aggregate: `124` suites / `893/893`, lint `0` actionable issues, assemble/androidTest compile PASS. Final APK `48,793,374` bytes, SHA-256 `A1483FF6693ADDF378CB880B465C76CE382FF59F3183B11EBADECB8C6F4E8C6D`, installed on Xiaomi. Physical `DeviceHealthPanelTest` + `AIAssistantScreenTest` are `10/10` PASS; bounded launch has no AndroidRuntime crash.
- Firmware/backend regressions remain green: source/golden `4/4`, device-security `65/65`. A fresh 18-second COM9 probe confirms Wi-Fi join and authenticated WSS. Stable mic data is nevertheless background-level on both slots and classified `too_weak`; the boot transient `detected` sample is not accepted as biomedical audio proof.
- Outcome: UI/telemetry slice is closed. Real heart/lung acoustic capture, provider-backed AI inference and signed OTA/forced rollback remain open; G3 is PARTIAL and G4 remains gated.
- Delivery proof: pushed `fd48565608cd6c2f0843d74604ae6bd39cbb5d4e` to `origin/main`; replacement-account Render deploy `dep-daepuluq1p3s73d9ucc0` reached `live`. Public health is `200` with marker `fd48565608cd`; exact CORS checks pass for `https://shcare-admin.web.app` and `https://shcare.web.app`, and an invalid origin receives no allow-origin header. This publishes the backend telemetry allowlist but does not close the physical mic/AI/OTA gates.
