# Shcare Active Restart Checkpoint

Last updated: 2026-08-24 ICT

Read this file first after quota exhaustion, task compaction, Codex restart or
host power-off. It records unfinished work only. Closed evidence lives in the
newest sections of `SMART_HEALTH_CONTEXT_NEW_CHAT.md` and
`SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`.

## Current pointer — approved integration plan v4

- Master plan: **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform
  Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)**.
- Approved addendum: **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và
  phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**.
- Master state: Phase 0–7 closed at `source/build/local`; Phase 8 active.
- Addendum state: G0–G2 are closed; **G3 — Khóa release candidate và test ESP32
  hai mic is active**; G4 pending. User-visible progress must show only G0–G4.
- Worktree: `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-rc2-impl-8e2`.
- Branch/HEAD at G0 entry: `release/shcare-v1.0.0-rc.2-local-demo` /
  `1c902b29405717c28d8dfa908e4eeb16137971cc`.
- Initial dirty-set digest: `d68fc486a354ed0fc0df75a061eece45f75870e98c517a63117d065d45b97776`
  over 32 non-`.gstack` files. Canonical inventory:
  `docs/SHCARE_G0_INTEGRATION_SOURCE_MANIFEST.md`.
- Last retained gate: Phase 8 release-source proof at verified product revision
  `c1933d979db69ae8bc105489d1accdec9bfd0fe5`; do not rerun Phase 0–7 without a
  reproduced regression.
- G0 verdict: all 65 Web routes have UI; current Public/Auth/Portal work is a
  presentation merge, not a business rewrite. Current RC already has complete
  Storage UI/API/RBAC; production missed its menu/direct-route entry point.
- Hardware preflight and final G3 flash bind `COM9` to ESP32-S3 revision 0.2,
  16MB flash and 8MB PSRAM. The latest production image is flashed and its
  bootloader/partition/OTA-data/app writes were hash-verified.
- G1 closure (`2026-08-23`): G0 proves all 65 Web routes already have usable UI,
  `CHƯA_CÓ_UI=none` and no genuine Phase 0–7 business gap. G1 therefore closed
  the presentation merge and reproduced regressions only; it did not reopen or
  rewrite Phase 0–7.
- Web is GREEN at contracts `135/135`, direct local TypeScript, ESLint and Vite
  client+SSR build. Public desktop/light remains `17/17` and the new all-route
  phone/system sweep is `335/335` across 22 routes. Auth login and forgot-password
  desktop/dark remain `17/17`; mobile/system registration remains reachable.
  Portal phone/light is `478/478` and desktop/dark is `474/474`, each across 21
  routes. Theme is `light|dark|system`, same-tab/cross-tab synchronized, and the
  Portal account-menu control no longer covers mobile KPI content.
- Admin is GREEN at contracts `189/189`, ESLint and client+SSR build. Storage
  menu/direct URL/capability/403 proof is `7/7`; Storage browser proof passes all
  four phone/desktop × light/dark combinations. Full 15-route sweeps pass at
  phone/light and desktop/dark, including command palette, offline, Account
  contracts, detail-drawer focus, representative states and limited-principal
  direct-URL denial. All recorded G1 browser gates have zero Axe serious/critical,
  horizontal overflow, sub-44px target, unintended console error or request error.
- Reproduced contrast fixes are deliberately narrow: Admin light secondary text
  uses `#52677a`, device Offline uses the semantic danger-text token, and live
  Public dark-system flow counters/active billing controls use accessible text.
  The deployed legacy visual vocabulary, copy and composition remain preserved.
- Current working snapshot remains on HEAD
  `1c902b29405717c28d8dfa908e4eeb16137971cc`; deterministic dirty digest is
  `a22ba6db562490128711e03593a72c33283705fadfae04ceb390024f7a0a6e8f`
  over the tracked binary diff plus 14 extant non-`.gstack` untracked-file hashes,
  excluding this self-referential checkpoint file. Preserve this dirty work; do
  not reset or replace it with the old Live checkout.
- G2 closure (`2026-08-23`): backend/shared/Android/firmware have zero source diff.
  Fresh shared contracts are `50/50`, storage metadata `6/6`, workspace-access
  and repository smokes PASS; retained Android `116 suites / 830 tests` and
  firmware production/OTA evidence remain applicable. Admin 5-viewport ×
  3-theme coverage is `225/225` route-cases. Public is `5,025/5,025`, Auth is
  `3,615/3,615`, and Portal is `7,130/7,130` browser checks across all canonical
  routes at 360/390/768/1024/1440 and light/dark/system. Portal RouteContract
  coverage is `315/315` route-cases. Final aggregate gates are Web contracts
  `137/137`, direct TypeScript, ESLint and client+SSR build; Admin contracts
  `190/190`, ESLint and client+SSR build; `git diff --check` is clean.
- G2 reproduced and fixed only three genuine seams: inaccessible Doctors success
  text, Auth laptop mobile-header blur, and a non-focusable scrollable consent
  ledger. The Portal runner is now permanently filterable over the full 5×3
  matrix. Parallel external-font aborts were rerun sequentially and passed; they
  are not recorded as product failures.
- G3 in-progress checkpoint (`2026-08-24`): fresh release-source gates are GREEN
  at Web contracts `137/137`, direct TypeScript `8.828s`, lint and client+SSR
  build; Admin contracts `190/190`, lint and client+SSR build; backend
  `smoke:release-runtime 1/1` and provider-free `check`. Web `dist` tree SHA-256
  is `d3ada8977f812a8a3636db06d40b6a43eea4c09ed624fe6fa31b609f585723f9`;
  Admin `dist` tree SHA-256 is
  `04718b8fc2ace54224cc3a274f2702f6e46a8271f5bc6206a3791b21746d135f`.
- G3 firmware diagnostics expose bounded aggregate RMS/peak/window/sample
  counters independently for I2S slot 0 and slot 1 while preserving the exact
  averaged mono PCM and audio-v2 contract. The five additive capture-queue
  counters are now synchronized through the backend sanitizer, closed shared
  schema, OpenAPI and JSON/SQL projection. Shared contracts are `51/51`, device
  security is `82/82`, backend check and all focused firmware source contracts
  pass.
- The prior synchronous WSS/capture P1 is remediated: a dedicated priority-3
  FreeRTOS capture task owns I2S/DSP, enqueues into a static bounded eight-frame
  queue without waiting, and the loop task alone owns WSS/UDP. Session
  generation/ordinal fences, stale/drop/discontinuity accounting and OTA
  pause/ACK are present. Production TCP connect, I/O and TLS-handshake timeouts
  are bounded to one second, below the built five-second watchdog.
- A second independent P1 review proved ArduinoWebsockets 0.5.4 could report a
  binary send as successful after a partial TLS write. The production transport
  now observes the exact `client.write` byte count, increments `wsPacketsSent`
  only after a full write, and force-closes/resets auth and audio state on a
  partial write. Final independent review reports zero remaining firmware
  P0/P1. A P2 remains: separately-read diagnostic counters can differ slightly
  within one telemetry snapshot; it does not affect frames, sessions or OTA.
- Final production and OTA images are `1,124,704` bytes against a `6,291,456`
  byte app slot. Production SHA-256 is
  `A31F9F6B32AF05F253AEB5D00063F8BA0318D6C9965CB0F9EE01B9CB02E54004`;
  OTA SHA-256 is
  `ECB97D1D56561D954425365CF15E7FE35F3A7C26BDC65B659196FFB028A3A9E1`.
  Both images have valid checksum/validation hashes and the dual-OTA partition
  table ends exactly at 16 MiB.
- Same-run final HIL flashed the production image with every write hash verified.
  A controlled 20-second boot capture retained 63 reports per slot: slot 0 RMS
  `21–5,696` / peak `53–7,892`; slot 1 RMS `17–4,634` / peak `49–7,154`; every
  retained RMS/peak sample was nonzero, both reached `2,358` active windows, the
  watchdog was active at five seconds, and no degraded/unavailable/post-boot
  reboot marker was observed. A separate stable 25-second capture retained
  `82/82` nonzero reports per slot. Two-slot I2S/serial HIL is PASS. Evidence:
  `docs/evidence/g3-hardware-01.md`.
- Production WSS remains deliberately fail-closed at
  `CREDENTIAL_STORAGE_ENCRYPTION_REQUIRED`: the current precompiled Arduino/IDF
  target has neither flash encryption nor an `nvs_keys` partition. Never fake
  this with a compiler define or burn irreversible eFuses without a dedicated
  provisioning runbook. Local non-PHI I2S/serial HIL may proceed independently.
- The earlier deterministic dirty digest `a22ba6db...` is superseded by the G3
  firmware/backend evidence. Recompute the exact candidate inventory/digest only
  after the Deep Security disposition settles.
- Pre-security restart identity: `77` intentional non-`.gstack` files excluding
  this self-referential checkpoint; sorted `status|path|bytes|sha256` digest is
  `55383c8d2d809c57fceb7ce33b4df58aed8eea07bd7ea28d2b7c049e3e312d4b`.
  Final staged inventory must still be recomputed after the scan.
- Resume action: continue G3 only. In the Codex composer switch this thread from
  `Full access` to `Ask for approval`, send a new turn so the host supplies a
  managed filesystem permission profile, then resume the existing scan (never
  create a replacement). After it completes, freeze the exact intentional
  candidate/source manifest and recompute hashes. Do not reopen G0–G2 without a
  newly reproduced regression.
- Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separate at
  its last-known `running/preflight` and blocks G3 release sign-off, not G0–G2
  work. Plugin `0.1.21`, its skill and durable tools are now exposed; the
  authoritative context was loaded successfully. Discovery did not start
  because this thread exposes `permission_profile=disabled` under `Full access`,
  while read-only Deep Scan workers require a host-managed profile. The scan was
  not replaced, completed, failed or cancelled and no canonical artifacts were
  created. This cannot be repaired from shell or `config.toml`; apply the
  composer permission change above and resume the same durable scan next turn.
- ESP32 plus two microphones are now physically available. Hardware proof is no
  longer globally deferred. Safe board/pin/partition preflight, wired flash and
  two-slot I2S HIL are complete; production cloud/OTA rollback proof remains a
  separate BLOCKED row until secure device provisioning is available.

## Historical checkpoint archive

## Last closed checkpoint — Phase 3 source/build/local closure

**Phase 3 — Identity, profile và security** is complete at every currently
available source/build/local gate. The final independent exit review found no
remaining P0/P1 in the Avatar exact-authority, repository, migration or 2FA
lifecycle scope.

- Web final: Avatar/Workspace Settings `62/62`, Auth `396/396`, contracts
  `121/121`, direct local TypeScript, full ESLint, client/SSR production build,
  CSS `60.58 kB gzip`, and targeted diff-check all pass.
- Backend final: Avatar repository `22/22` plus API smoke; 2FA `35/35`; check,
  repositories and workspace-access pass. Exact auth-session and archived
  workspace stage/commit fences are active for JSON and PostgreSQL paths.
- Retained convergence proof: Admin contracts `185/185`, shared `43/43`, Android
  `108` suites / `776` tests plus compile/lint/assemble. Provider/live/PostgreSQL
  runtime remains `BLOCKED`; this does not create a software debt inside Phase 3.

## Active Phase 4 row

Continue **Phase 4 — Device provisioning và command** from the current diff:

1. Backend device trust/RBAC: provisioned-device-only claim, strict platform
   authority for fleet/rotate/revoke/generic command operations, tenant-negative
   tests, exact idempotency, and `protocolVersion` retention.
2. Android native pairing: QR/manual claim, secure setup AP with per-device PoP,
   then authenticated WSS online confirmation; no BLE and no success inferred
   from REST acceptance.
3. Firmware canonical `MSM261S4030H0`: authentication/telemetry/ACK plus finite
   I2S degraded retry, watchdog and bounded non-PHI event/telemetry buffering.
4. Then converge Admin inventory/command/OTA status and Portal read-only device
   state against the same backend contract.

Current backend source gate is GREEN at `npm.cmd run check` plus
device-security `42/42`; retained ownership/setup/repository/workspace gates
remain GREEN. Firmware source-contract, MCU compile-only and normal/OTA builds
pass after the resilience remediation. HIL and physical-board proof remain
`DEFERRED — chờ phần cứng`. The independent cross-surface exit review reopened
five P1 software blockers, so Phase 4 must not be marked complete yet.

### 2026-08-15 Phase 4 P1 convergence checkpoint

- Resume from this paragraph after a quota/task/host interruption; do not redo
  the closed Phase 0–3 rows or the already-green Phase 4 gates below.
- Backend candidate remediates the generic-command lifecycle bypass, SQL/JSON
  pairing race, exact active-workspace claim authority and the final authenticated
  socket registration race. Root proof is GREEN at backend `check`,
  device-security `44/44`, ownership repository `41/41`, setup security `3/3`,
  repositories and workspace-access. One deterministic workspace error-code
  regression was corrected before the final `44/44` rerun.
- Portal claim now submits and verifies the exact active `organizationId`; Web is
  GREEN at Auth `389/389`, contracts `122/122`, direct local TypeScript, full
  ESLint and client/SSR build. CSS remains `60.58 kB gzip`.
- Admin revoke now retains one intent-scoped `Idempotency-Key` across ambiguous
  retries and clears it only after confirmed success/dismissal. Admin is GREEN at
  contracts `183/183`, direct local TypeScript, full ESLint and client/SSR build.
- Android claim/presence confirmation is bound to immutable user/workspace/
  authority epoch and rejects foreign or stale receipts. Aggregate proof is
  `108` suites / `784` tests, compile main/AndroidTest, lint and assemble. The new
  APK is `26,895,661` bytes with SHA-256
  `0383C3FA570524E04B185C00DEDDDD3D909C5A5113B9D76B3964CF4EDB1BC5FD`.
  ADB currently reports no attached emulator/device; runtime proof is not
  inferred from source/build proof.
- The remaining active Phase 4 software gate is the closed shared/OpenAPI
  contract set for exact-workspace pair, safe generic command, revoke,
  two-phase rotate and signed OTA. It is being authored and must pass package
  tests plus an independent P0/P1 re-review before this software candidate can
  advance. Phase 4 remains **IN PROGRESS**; physical HIL remains
  `DEFERRED — chờ phần cứng`.
- Phase 5 has only a read-only inventory running in parallel. That inventory
  does not change the visible phase and cannot mark Phase 5 complete.

### 2026-08-15 Phase 4 continuation checkpoint

- Backend factory/device trust has converged at source/local: a browser cannot
  enroll a factory credential or choose a new device identity; Admin provisioning
  requires an existing factory-enrolled device, while claim is workspace-bound
  and command/rotate/revoke/OTA remain Platform Admin-only. Exact replay,
  cross-workspace and negative-role coverage is GREEN at device-security
  `41/41`, ownership-repository `37` assertions, setup-security, repositories,
  workspace-access and backend check.
- Portal is now a state/claim/assign surface only. It no longer sends restart,
  command or OTA mutations and never reports device application from local state.
  Current Web proof is contracts `122/122`, claim `10/10` and device-route subset
  `8/8`; direct TypeScript, ESLint and production build retain their GREEN proof.
  Generic Portal mutation smoke records live claim as `BLOCKED` until a disposable
  pre-provisioned factory fixture and exact cleanup provider exist.
- Platform Admin no longer accepts or generates `deviceSecret`. Its smoke requires
  `SMOKE_FACTORY_DEVICE_ID` for a disposable factory-enrolled record, provisions
  that exact identity and checks an exact response. Admin contracts are `183/183`,
  direct TypeScript, ESLint and production build GREEN.
- Shared HTTP/device schemas now include exact factory-enrolled provision and
  authenticated-online pair request/receipt fixtures plus detailed OpenAPI paths;
  the package is GREEN at `44/44`. Web manual claim now emits canonical
  `connectionMethod=Manual`, matching Admin, Android and backend normalization.
- Backend public device projection is allowlisted instead of spreading arbitrary
  persisted keys. Nested command idempotency/fingerprint/payload fields and OTA
  token/signature/URL are stripped; provision/pair receipts use bounded exact
  projections. Device-security is GREEN at `42/42` after this hardening.
- Canonical firmware adds finite I2S degraded/retry recovery, watchdog and a
  bounded eight-item non-PHI operational queue. The four reopened software
  blockers are remediated: nested OTA commands fail busy, the watchdog is safe
  across blocking flash work, active recording rejects OTA without stopping I2S,
  and rollback failure is bounded/terminal with durable post-boot handling. The
  independent four-blocker re-review found no remaining software blocker in that
  scope. Firmware source-contract PASS; MCU target compile-only PASS with `0`
  tests executed. Normal and OTA images are each `1,104,640` bytes. Normal
  SHA-256 is
  `CB2B0A8749697FEEB14F4720E64A0CF8629109CDF6377784B7DB7F6CB2BAA7B5`; OTA
  SHA-256 is
  `CA79DE814DAC8D6BB3A48EB87F80E6ADDF331C62009129C013C250F30A074801`.
  The earlier hashes `FB0FDF91E2194C9361FE0FF9627972D31B0C6E9E29230A245B1357D3B4E4453E`
  and `88143F7BFC0EB3892F47485DB53FA2D1544966FAA489D4AC533C3016D653BD88`
  are superseded pre-remediation artifacts and are not release evidence. Native
  C++ execution is unavailable because this host has no `gcc`, `g++`, `clang` or
  `cl`. Flash, serial, I2S, secure WSS, reconnect, OTA rollback and physical
  16 MB validation remain `DEFERRED — chờ phần cứng`.
- Android native QR/manual + setup-AP/PoP pairing is source/build GREEN. It sends
  only `deviceId`, `claimCode`, `connectionMethod` and `Idempotency-Key`; an
  accepted claim stops at setup, while success requires the exact WSS tuple or a
  backend list snapshot with `online=true`. Secret material is cleared on cancel,
  expiry, fatal/session/permission failure, including 401/403 during presence
  polling. Aggregate proof is `108` suites / `781` tests, device package `48/48`,
  main/AndroidTest compile, lint `0` issue and assemble. APK is `26,895,661` bytes,
  SHA-256
  `F32C7C3A85E40A217ACC8AEEC2DDF6DD0DA6694FA69B53BC4AF94263DD6828FE`.
  ADB reports zero devices and `google-services.json` is absent, so camera,
  setup-AP and authenticated WSS runtime remain deferred rather than inferred
  from this source-verification debug artifact.
- Deep Security remains separate and untouched at `running/preflight`. Phase 4
  remains **IN PROGRESS**: the firmware four-blocker remediation/re-review is
  GREEN, but the independent backend/shared/Web/Admin/Android cross-surface exit
  review reopened five P1 software blockers:
  1. Generic Admin command must exclude specialized revoke/rotate/OTA/audio
     lifecycle types.
  2. SQL pair must share the ownership lock and current row.
  3. Pair contract, Portal and Android must require exact active workspace and
     verify receipt/poll authority.
  4. Admin revoke must use a stable `Idempotency-Key`.
  5. Shared/OpenAPI must define command/revoke/rotate/OTA contracts.
  Hardware-only proof stays `DEFERRED — chờ phần cứng` rather than being
  reported as PASS. Resume these five software remediations first, rerun the
  affected gates, then request independent exit re-review.

## Prior closed checkpoint — Phase 2 source/build/local closure

**Phase 2 — Hai UI foundation Web/Admin và Android độc lập** đã đóng ở mức mọi
phần mềm có thể kiểm tra tại source/build/local. Không mở lại Phase 2 nếu chưa
tái hiện regression hẹp trên cây hiện tại.

- Web: toàn bộ bốn file trong active CSS graph hiện có `0` `!important`; gate
  chống tái phát `7/7` pass. CSS production `60.58 kB gzip`, font Việt
  `82,572 bytes`, public initial graph `228,654 bytes gzip` đều đạt ngân sách.
  Canonical composite wrappers đã có và route đại diện dùng chúng.
- Web gates: contracts `121/121`, Auth/component `309/309`, direct TypeScript,
  ESLint, Prettier và Vite client+SSR đều pass. Local production performance
  đo thật: LCP `276 ms`, INP `64 ms`, CLS `0.00034024`, transfer `342,252`
  bytes và script `197,009` bytes.
- Browser final trên output CSS production có SHA-256 ổn định trước/sau
  formatting: Public Chromium/Firefox/WebKit đều `240/240` checks trên
  `5 viewport × light/dark/system`; Portal Chromium `459/459`, Firefox
  `1,375` và WebKit `1,377` checks trên `63` route-cases mỗi engine. Axe
  serious/critical, overflow, console/page error và reduced motion đều sạch.
- Admin: contracts `185/185`, ESLint và production build pass. Browser hiện tại
  chứng minh clinics phone-light với loading/error/retry/empty/403 và direct
  denial; account/devices desktop-dark chứng minh 2FA/preference contract,
  command palette, offline state và drawer focus/Escape/restore.
- Android: SignUp abandonment/back đã owner-bind và cleanup đúng; copy hiển thị
  đã chuyển sang resources; typed route/deep-link, adaptive scaffold, state
  components và mobile theme độc lập đã có. Full unit `682/682`, Kotlin compile
  `0` warning, AndroidTest compile, lint `0` warning/`0` error và assemble đều
  pass. APK `24,272,028` bytes, SHA-256
  `FE74074AFE6D6B470A5ECBC67FB48CED50A01B21829B544FF46D86805D72324B`.
- Live Portal performance, Firebase/provider, emulator/TalkBack/golden và thiết
  bị thật vẫn được ghi riêng `BLOCKED`; hardware proof là
  `DEFERRED — chờ phần cứng`. Đây không phải source PASS giả và không được suy
  diễn từ build/local proof.

## Closed Phase 3 row (historical implementation evidence)

Tiếp tục **Phase 3 — Identity, profile và security**. Đầu tiên dùng gap audit
trên code hiện hữu cho Web Auth/Account/Workspace, Android
Auth/Profile/Family/Workspace/Sessions/2FA và backend
role/membership/session/2FA; không viết lại phần đã có bằng chứng. Mọi mutation
phải owner/workspace-bound, idempotent, audit được và chỉ báo thành công sau
receipt canonical.

Audit khởi động Phase 3 không phát hiện P0. Checkpoint phần mềm hiện tại:

- Android Forgot Password đã đóng source/local: repository/ViewModel immutable,
  owner + Firebase/backend session epoch, double-submit/cancel/retry và generic
  anti-enumeration receipt. Full unit toàn app `702/702`, lint `0`, AndroidTest
  compile và assemble pass; APK SHA-256
  `CF3AC1620CBE37F4D4A0545453DAD4F97AEC1FEFD09ADB337D387DBE8DA9264C`.
  Provider/runtime vẫn `BLOCKED` do thiếu `google-services.json`.
- Android Family CRUD đã khóa exact account/workspace/patient/intent receipt và
  giữ nguyên target + key qua delete mơ hồ; focused `26/26` và Kotlin compile
  pass. Backend/shared additive canonical patient receipt đang triển khai; app
  cố ý fail closed với envelope cũ nên chưa được deploy trước backend.
- Web/backend Workspace Settings atomic/idempotent đã đóng: JSON/Postgres
  transaction + rollback + audit + replay receipt, Web stable key và exact
  parser. Lifecycle `7/7`, shared contract `40/40`, Web focused `33/33`, direct
  TypeScript, ESLint và Vite client+SSR đều pass.
- 2FA response-loss đã có deterministic keyed delivery trong cửa sổ giới hạn,
  không persist/log plaintext code, OTP, token hoặc Idempotency-Key; verify/ACK
  bind account + enrollment + primary session, double-submit và ACK chỉ audit
  một lần, sau ACK không trả code lại. Backend/security `20/20` và shared
  HTTP/OpenAPI `40/40` pass. Web exact parser/API/UI ACK đã triển khai; chạy lại
  focused Web sau khi lát cắt Avatar trả quyền hai shared file.
- Inactive Firebase account hiện bị chặn trước `rememberAuthSession`; Firebase
  compatibility/source-order suite `9/9` pass.

Ba lát cắt đang chạy song song, tách boundary: Android biometric local unlock;
Web/backend Avatar transaction/cleanup; backend/shared canonical Family receipt.
Sau đó còn phone auth placeholder, Web profile stable key, Android avatar retry,
Android 2FA parity và Phase 3 browser/emulator/provider proof. Không gọi Phase 3
PASS trước khi mọi gap phần mềm đóng; emulator/provider tiếp tục ghi `BLOCKED`
thay vì tạo bằng chứng giả.

## Closed inherited Phase 3 vertical slice

Vertical slice **Canonical Session Revocation Receipt** đã đóng ở
source/build/local và là baseline đầu tiên của Phase 3.

- Actor: chủ tài khoản đã xác thực.
- API: `POST /api/v1/auth/sessions/:id/revoke` với `Idempotency-Key` ổn định,
  owner-bound; cross-account trả 404.
- Canonical receipt: `{session, revoked: true, replayed}`; backend, Web/Admin và
  Android cùng fail closed nếu receipt thiếu, sai owner/session hoặc stale.
- Web: `/portal/settings` tab Security. Android: route `privacy`. Firmware: N/A.
- Shared schema/fixture, audit `auth.session.revoke`, operation correlation,
  replay/key-reuse negative, cross-account denial, Web partial-retry và Android
  parser/owner checks đã có test. Legacy alias được giới hạn, có deprecation
  header/metric và không cho bypass current-session guard.
- Deploy order: backend additive trước, sau đó Web và Android.

1. Backend tiếp tục là nguồn sự thật cho membership, workspace, session, 2FA và
   mutation outcome; Firebase chỉ xác thực identity.
2. Web và Android dùng chung contract nhưng giữ UI/UX độc lập. Deep link phải
   allowlist, bind owner/workspace/session và fail closed.
3. Provider-dependent phone/2FA chỉ hiển thị khi runtime thật sẵn sàng; không
   báo enabled/success trước enrollment/challenge/backend receipt.
4. Bất kỳ live/provider/emulator proof nào chưa có phải giữ `BLOCKED`, nhưng
   không giữ source/local Phase 3 đứng yên nếu vertical slice đã qua gate.

## Live continuation checkpoint — Phase 3 identity/profile/security

- Family patient mutation contract is now source/local complete. POST/PATCH/DELETE
  return the canonical owner/workspace/patient/intent receipt, replay the exact
  stored resource snapshot, and reject cross-workspace replay. Shared contracts
  are `41/41`; workspace-access, repository smoke, backend tests/check and
  `git diff --check` pass. PostgreSQL live remains separate provider proof.
- Android 2FA parity is implemented through API/repository/ViewModel focused
  scope: verify sends a stable `Idempotency-Key`, validates the exact
  user/enrollment/delivery receipt, pins the auth-session epoch, rejects late
  cross-account responses, and keeps recovery codes until the backend ACKs the
  exact delivery with the same operation key. The route now injects the
  canonical user/session epoch. Both system Back and app-bar Back are blocked
  while recovery codes await the exact backend ACK; ACK errors are announced
  and busy controls cannot double-submit. The focused Android security/route/UI
  gate passes `55/55` after this change.
- Android biometric local unlock is implemented as a device-local AndroidX
  Biometric/Keystore gate and remains distinct from server 2FA. Its focused
  proof is `9/9`; the pre-cleanup combined proof was `726/726`, main and
  AndroidTest Kotlin compile plus clean lint. A final combined rerun and APK hash
  are still required after the adjacent Phone Auth cleanup.
- The fake Phone Login production path is removed: no canonical screen, route
  or build flag can expose it until Firebase Phone Auth/provider is real. The
  inactive Figma prototype is documented `N/A`, not treated as production.
- Active parallel work remains: Web/backend Avatar transaction/provider-cleanup,
  backend/shared Account Profile mutation, Web Phase 3 gates and Android exact
  Avatar receipt parity. Do not call Phase 3 complete until those converge and
  the combined backend/Web/Android gates pass.
- The Account Profile convergence audit found two confirmed blockers that must
  survive any restart: four referenced shared schema/fixture files plus the
  OpenAPI path/schemas are absent, and the SQL partial-update helper currently
  replaces every omitted profile field with an empty string. The JSON path does
  not do that. Fix schema/OpenAPI and make JSON/Postgres partial PATCH semantics
  identical before either client migrates to the canonical receipt.
- Those two Account Profile blockers are now fixed and regression-covered.
  Family POST/PATCH/DELETE also require the header-only idempotency key promised
  by the contract. Current convergence proof is: shared `43/43`; backend
  check/base/repositories/workspace/Avatar gates; Web Auth/UI `350/350`, Web
  contracts `121/121`, production build and Chromium phone-light `459` checks;
  Android full unit `739/739`, AndroidTest compile and assemble. Android lint
  now reports `No issues found` after removing the unused Phone Verification
  resource. The rebuilt debug APK is `26,881,173` bytes with SHA-256
  `242999988FE3B137AA6499315428888598FBABC2B9206034FDA539F9C4D4C698`.
  The independent review found no P0 but reopened three P1 gates before Phase 3
  closure: Family workspace/authority can change before backend commit; 2FA can
  become enabled before recovery-code ACK survives reload/process death; Avatar
  provider cleanup has no autonomous consumer after a pending failure. All three
  are now implementation work, not deferred debt. The prior APK/hash is a
  pre-remediation checkpoint and must be rebuilt after they close.
- Residual review cleanup also remains in the active row: Web profile/avatar
  operations must reject same-user/new-auth-session late responses and must keep
  the same confirmed operation identity if local reconciliation fails. Dead
  Phone verification effects have already been removed from the Android Profile
  path; the unavailable phone field remains read-only and truthful.
- 2026-08-09 continuation checkpoint: Android 2FA P1 remediation now follows the
  pending-delivery contract. OTP verification returns `enabled=false`, keeps the
  recovery ACK token only in memory, and installs no second-factor token. The
  exact ACK sends `deliveryId + recoveryAckToken` with the original verification
  idempotency key; only an exact owner/enrollment/delivery/session ACK installs
  the completed token. Reload/process recreation remains disabled+pending and
  the native UI truthfully offers a safe restart because recovery plaintext is
  not persisted. Focused ViewModel/UI tests pass. The focused API suite currently
  now consumes the canonical shared pending/ACK fixtures; the combined focused
  Android proof is `45/45` (`14` API, `18` ViewModel, `13` UI contract). Phase 3
  remains IN PROGRESS. Family race,
  Avatar autonomous cleanup, shared/Web 2FA and final combined gates are active
  parallel work; none may be deferred as software debt.
- 2026-08-09 Avatar P1 source/local closure: avatar cleanup is now an autonomous
  durable worker with startup sweep, single-owner lease, bounded provider timeout,
  exponential backoff, maximum attempts, dead-letter metrics, completed-only
  retention pruning, active-object protection and graceful SIGINT/SIGTERM stop.
  The mutation receipt remains `cleanup=pending` until the worker actually removes
  the provider object; an idempotent replay then returns `completed`. Web and
  Android retain a visible in-screen warning while cleanup is pending and do not
  emit final-success semantics. Evidence: backend repository `10/10` plus API smoke
  GREEN, Web focused aggregate `44/44`, Android AccountProfile `17/17` plus debug
  Kotlin compile, and targeted diff/whitespace checks GREEN. Provider/live proof is
  still separate; this closes only the actionable software P1. Family authority,
  shared/Web 2FA and the final combined Phase 3 gates remain active.
- 2026-08-09 independent-review correction: Avatar P1 is REOPENED and the closure
  paragraph above is evidence for the first implementation pass, not a final gate.
  Three software gaps remain actionable: dead-letter must update the canonical
  receipt/UI truthfully instead of replaying forever as `pending`; provider upload
  followed by DB failure and rollback-delete failure must enqueue a durable orphan
  cleanup record; and pending/dead-letter state must hydrate after Web reload and
  Android process death instead of living only in component/ViewModel memory. The
  Avatar worker track is actively remediating all three; none is deferred.
- 2026-08-09 Family authority candidate closure: backend/shared/Web/Android now
  pin the exact account, workspace and backend authentication session for patient
  create/update/delete; Web and Android additionally pin a local session epoch.
  JSON and PostgreSQL paths check authority under the mutation lock/transaction
  before replay, patient write, audit or idempotency write. Negative coverage spans
  create/update/delete across stale workspace, account and session and asserts zero
  persisted deltas. Portal personal-patient routes now resolve and send the same
  authority headers, while workspace staff compatibility remains unchanged. Branch
  evidence is backend repository/workspace/check GREEN, shared `43/43`, Web focused
  `12/12 + 5/5` plus lint/build, Android focused plus assemble, and scoped diff
  check GREEN. Independent review and the final combined gate are still required
  before this candidate is called a final Phase 3 closure.
- 2026-08-09 independent-review correction: Family P1 is REOPENED on Android.
  A backend mutation may commit before a delayed canonical response is rejected
  locally because the auth-session epoch changed. The stale result must remain
  quarantined from the replacement account, but the current ViewModel classifies
  that post-dispatch mismatch as definitive and clears the create/update key or
  pending-delete intent. That can create a fresh key after a real commit. The fix
  must retain the exact intent/key as an ambiguous outcome, reconcile only under
  the original account/workspace/session authority, and prove create/update/delete
  cannot duplicate or expose the old result to a replacement account.
- 2026-08-09 2FA candidate closure: shared/OpenAPI/backend/Web now keep OTP verify
  at `enabled=false,enrollmentPending=true`; only the exact recovery delivery,
  one-time ACK token and original idempotency key atomically enable 2FA and issue
  completed session material. Web rejects same-user/new-auth-session ABA and guards
  one-time recovery codes across pointer/keyboard tab changes, browser/SPA Back and
  unload with an accessible stay-versus-abandon dialog. Candidate proof is backend
  `26/26`, TwoFactorPanel + WorkspaceSettings `41/41`, lock lifecycle `8/8`, direct
  TypeScript in 10.9 seconds, targeted ESLint and diff check GREEN. The merged Web
  build/full suite and independent end-to-end review remain required after Avatar
  stops editing the same settings/API files; this is not yet a Phase 3 PASS.
- 2026-08-09 independent-review correction: 2FA P1 is REOPENED at enrollment
  start/restart. `POST /me/2fa/enroll` did not carry an idempotency key. If the
  one-time bootstrap response was lost or the client reloaded, both clients offered
  a safe restart while JSON/SQL repositories rejected the still-live unverified
  enrollment until expiry. Start/restart must now be an owner+primary-session-bound
  stable intent with safe exact replay or immediate safe supersession, without
  persisting plaintext bootstrap secrets. Lost-response, reload/process restart,
  different-key supersession, old-enrollment denial and cross-session/account tests
  are mandatory. Root also removed three unreachable legacy pre-ACK enable/old-ACK
  blocks from `server.js`; the post-cleanup 2FA smoke remains `26/26` GREEN.

### 2026-08-14 Phase 3 continuation checkpoint

- The governing plan is still **“Kế hoạch tái thiết toàn diện Shcare Web,
  Portal, Platform Admin, Android và firmware”**. Phase 0-2 remain closed and
  Phase 3 remains in progress; this continuation does not create a new plan or
  reopen Family/profile rows that already have recorded proof.
- Avatar provider-generation fencing is GREEN at backend repository `15/15`,
  API smoke, repeated race `20/20`, Android focused `30/30` and Web focused
  `6/6 + 4/4`. Independent exit review then REOPENED one P1: upload/delete are
  not yet pinned to the exact backend auth-session ID and Web auth-session epoch.
  A same-user/same-workspace sign-out/sign-in replacement can therefore accept
  a stale E1 commit/result in E2. Exact backend commit fencing plus Web intent,
  cache and late-result epoch checks are now mandatory.
- 2FA start/restart aggregate is GREEN at backend `33/33`, Web Auth `377/377`,
  Android focused `39/39` and shared `43/43`, including safe terminal recovery
  states. Root source review then REOPENED one P1: persisted
  `startIntent.superseded` currently means both “this new enrollment replaced an
  old one” and “this old enrollment was invalidated”. A replacement enrollment
  can later be consumed by verify/ACK and still satisfy the bootstrap replay
  exception. The persisted invalidation marker must be split and a consumed
  replacement must return 410 without rematerializing its secret.
- Platform Admin contract, ESLint, direct local TypeScript and production
  client/SSR build are GREEN in this continuation. These are supporting Phase 3
  proofs only; backend, Web and Android convergence plus independent review are
  still mandatory before Phase 3 can be marked complete.
- Current aggregate evidence before the two review corrections is backend
  check/base/repositories/workspace-access plus the focused gates above; Web
  `377/377 + 121/121`, lint, direct TypeScript and build; Admin contracts
  `185/185`, lint, direct TypeScript and build; Android `108` suites / `776`
  tests with zero fail/error/skip, AndroidTest compile, lint with no issues and
  assemble. The APK SHA-256 is
  `BAD58F2555AA87ED30438F3DA82A5FDDEF8BEB4E2CB065E58C1343B753A7EFA8`.
  These gates must be rerun in proportion to the two reopened fixes.
- Deep Security remains untouched at `running/preflight`. Provider/live,
  Firebase runtime and physical Android proof remain separate. Firmware/HIL
  proof is `DEFERRED — chờ phần cứng`; available source/build/simulator work must
  continue and cannot be replaced by that deferral.

### 2026-08-14 exact continuation checkpoint (Avatar authority convergence)

- Governing plan: **“Kế hoạch tái thiết toàn diện Shcare Web, Portal,
  Platform Admin, Android và firmware”**. Overall progress remains **Phase 3/8**;
  this is a continuation of the existing implementation, not a replacement plan.
- Closed rows remain closed. Fresh proof in this continuation is Avatar repository
  exact-session/commit-fence **20/20** and 2FA enrollment/recovery lifecycle
  **35/35**. No completed Family, UI-foundation, Admin or Android row is reopened.
- The only open Phase 3 P1 is same-user/same-workspace Avatar ABA across a new
  authenticated session. Backend server/API canonical authority headers and Web
  auth-session epoch/late-result quarantine are currently converging. Phase 3
  must not be marked complete until their focused tests, aggregate backend/Web
  gates and an independent post-fix review are all green.
- Independent repository review also reproduced an archived-workspace authority
  gap: workspace archival sets `deletedAt` while the Avatar JSON/SQL fence checked
  only `status`. JSON and SQL staging/final-commit authority must require a
  non-deleted workspace and carry a deterministic regression before closure.
- Candidate convergence after that review: archived-workspace stage/final-commit
  fencing is GREEN in JSON and SQL; Avatar repository is **22/22** and canonical
  API smoke passes. Backend `check`, repositories and workspace-access pass.
  Web Avatar/WorkspaceSettings is **48/48**, full Auth **382/382**, contracts
  **121/121**, direct local TypeScript, full ESLint and client/SSR build pass.
  An independent end-to-end Phase 3 exit review is still running, so this is a
  closure candidate and not yet a Phase 3 PASS.
- Exit review result: **FAIL — one P1 remains**. Late E1 success is quarantined,
  but a late E1 network/HTTP failure can still surface an error and retry action
  after E2 replaces the auth session. Retrying may carry E1's old file into a
  fresh E2 authority/key. Upload and delete must bind failure outcomes to the
  exact intent authority, suppress stale toast/error/retry state, discard the old
  file/variables and prove deterministic late-rejection E1→E2 regressions before
  Phase 3 can close. No other P0/P1 was found in Avatar repository/API/migration
  or the 2FA `invalidatedByEnrollmentId` lifecycle.
- Deep Security Scan remains separate and untouched at `running/preflight`.
  Physical firmware/HIL proof remains `DEFERRED — chờ phần cứng`; source, build
  and simulator work is not deferred.

### 2026-08-15 Phase 3 closure and Phase 4 restart checkpoint

- Governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal,
  Platform Admin, Android và firmware”**. The visible overview is Phase 0–3
  complete, **Phase 4 in progress**, Phase 5–8 pending. This checkpoint
  supplements the plan; it does not replace it or reopen a closed row.
- Final Avatar authority implementation binds immutable per-attempt user,
  workspace, exact auth-session ID/epoch, bearer and idempotency intent. Late E1
  success, late E1 rejection, resolver/hash/provider micro-races, original
  `AUTH_SESSION_REPLACED`, and auth-session-ID-only E1→E2 replacement all discard
  stale file/delete/retry/preview/cache/toast state and require a new explicit E2
  action.
- Root rerun evidence is GREEN: focused Avatar/Workspace Settings **62/62**,
  full Web Auth **396/396**, Web contracts **121/121**, direct local
  `tsc --noEmit`, full ESLint with zero warning, client/SSR production build and
  targeted `git diff --check`. CSS is **60.58 kB gzip**. Backend Avatar
  repository remains **22/22** plus API smoke; 2FA remains **35/35**; backend
  check/repositories/workspace-access, Admin **185/185**, shared **43/43**, and
  Android **108 suites / 776 tests** retain their recorded proof.
- The final independent Phase 3 P0/P1 re-review returned **PASS**. It confirmed
  immutable authority/error binding, stale success/error/retry suppression,
  exact-session-ID replacement and API catch/success guards. Do not redo these
  closed gates without a current reproduced regression.
- Phase 4 preparation is parallel but does not advance the visible phase early.
  Backend device baseline is GREEN at device-security **41/41**, ownership
  **5/5**, and setup-security **3/3**. Android secure QR/manual + setup-AP/PoP +
  authenticated-online confirmation and firmware I2S/watchdog/bounded non-PHI
  telemetry resilience are the two active source tracks.
- Firmware command work already completed source/build proof: restart/Wi-Fi do
  not report `applied` before reconnect; durable command receipts and HMAC-bound
  Wi-Fi configuration are present. Normal image SHA-256 is
  `6B19E628EBCFF6FF7CFE6EDF7639D54290367B214448EF5662DC40E414E46535`;
  OTA image SHA-256 is
  `F4322FDB1AC9116F4468FEE4AA2B4D69F05570708411165C1A371CED1BACB60A`.
  Native C++ execution is `BLOCKED` because `gcc/g++` is unavailable; OTA upload
  and HIL are `DEFERRED — chờ phần cứng`.
- Deep Security remains separate and untouched at `running/preflight`.

### 2026-08-15 Phase 4 OTA convergence checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal,
  Platform Admin, Android và firmware”**. The visible overview remains Phase 0–3
  complete, **Phase 4 in progress**, and Phase 5–8 pending. This is a continuation
  checkpoint, not a replacement plan or a Phase 4 completion claim.
- The OTA contract now separates the short command-delivery deadline from a
  bounded execution deadline. Acknowledged/applying OTA work no longer expires at
  the delivery TTL, while overdue execution terminates with
  `OTA_EXECUTION_EXPIRED` and late progress cannot revive it.
- Runtime OTA authority is correlated to device, OTA, command, firmware version,
  authenticated session and confirmed boot health. Event type/status mismatch is
  rejected, lost intermediate ACK/progress can be reconciled only from valid
  new-session boot proof, and incomplete legacy OTA state is omitted from public
  projections instead of being presented as canonical success.
- Durable firmware replay fencing and private artifact download hardening have
  landed. Production and OTA firmware compile/link, embedded-unit compile, the
  firmware source contract, OTA lifecycle **10/10**, and shared HTTP/device
  contracts **47/47** are GREEN. The private route is bearer-only, pins the exact
  artifact, verifies actual size/SHA before `downloading`, and terminalizes both
  OTA and command while revoking the verifier on artifact failure.
- Ownership replay parity now has **64/64** tests, including withdrawn
  doctor/workspace approval, canonical patient demotion, canonical platform
  authority versus operational platform membership, and personal-workspace
  restrictions. The last exclusive root backend convergence gate before the new
  private-download review was GREEN: syntax, repositories, ownership **58/58**,
  and device-security **59/59**. A prior
  57/59 run was confirmed as test-runner interference from shared temporary
  storage and is superseded by this exclusive run.
- Private-download review found five further P1 gaps now under repair: atomic
  OTA-command expiry, malformed/legacy expiry denial, ownership-transfer grant
  invalidation, bounded local/S3 reads, and stale-failure TOCTOU authority. The
  existing **59/59** suite does not close these gaps until the new negative/race
  tests land and root reruns it exclusively.
- Firmware closed the prior four P1s (tombstone, manifest fingerprint, unbound
  pending-image rollback, and two-phase confirmation), but final re-review found
  one remaining P1: failed/unavailable rollback can fall through to normal
  Wi-Fi/WSS/audio startup. A fail-closed recovery service gate and tests are now
  active. Source/build gates must be rerun after this final repair.
- Physical device flash, secure provisioning, audio and forced OTA rollback proof
  remain `DEFERRED — chờ phần cứng`. Source/build/simulator work continues and is
  not deferred. Deep Security remains separate and untouched at
  `running/preflight`.

### 2026-08-15 Phase 4 final-review correction (active)

- Phase 4 is still **in progress**. The independent backend exit review found one
  remaining P1: a private firmware download could rely on the long OTA execution
  deadline even when the matching, never-acknowledged command had already passed
  its shorter delivery deadline.
- The active repair must refresh the exact command under the canonical JSON/SQL
  lock or compare-and-set boundary before reading any artifact. An elapsed
  unacknowledged command must atomically expire the OTA and command and revoke the
  bearer grant. JSON and SQL regressions must cover a GET after delivery expiry
  but before OTA execution expiry.
- Phase 5 audio/scan source work may run in parallel for throughput, but the
  visible phase remains Phase 4 until this P1 and its focused/root gates pass.
- The final firmware binaries currently available for later HIL evidence are
  `esp32-s3-devkitm-1/firmware.bin` (1,120,848 bytes,
  SHA-256 `3153F65239F9F7D9859DB2F4473AB5D879E907A4FC410E0E1CEDFE8EC0FBA582`)
  and `esp32-s3-ota/firmware.bin` (1,120,848 bytes,
  SHA-256 `2E0BF2A5440FED1FEFEDCB1DA7C6E6531FF7925B011E61293508267C48AE119B`).
  These source/build artifacts do not replace physical hardware proof.

## Restart procedure

### 2026-08-09 resumed Phase 3 audit checkpoint

- The governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal,
  Platform Admin, Android và firmware”**. Phase 0-2 remain closed; Phase 3 is
  still in progress. This continuation preserves all earlier work and does not
  start a replacement plan.
- Avatar P1 remains open, but the first concurrent exact-intent defect is fixed:
  an unexpired upload lease now rejects the loser before provider put, while an
  expired lease can recover. The independent expiry audit reproduced a stale
  cleanup delete that could remove a new upload; the subsequent root code review
  identified a second deterministic interleaving in which a stale original
  uploader could commit after the retry rearmed a fresh provider generation.
  Immutable provider-generation fencing plus an exact commit fence
  and deterministic interleaving tests are now required before closure. Durable
  rollback, dead-letter receipt synchronization, workspace-scoped hydration, Web
  cache identity and Android authority checks remain preserved.
- 2FA enrollment start/restart source has converged across backend, shared schema,
  OpenAPI, Web and Android. The canonical start key is header-only; JSON/SQL bind
  exact replay to owner + primary session and a different key safely supersedes
  the prior pending enrollment. Android focused API/ViewModel main + unit compile
  is GREEN. Web/shared/backend aggregate gates, UTF-8/Vietnamese error-copy cleanup
  and the final late-response/secret-persistence review are still running, so this
  is not yet a closure claim. Migration order is now deterministic: `048` Avatar,
  `049` pending activation and `050` enrollment start intent.
- Family encrypted mutation outbox is source/local CLOSED. Per-authority AES-GCM
  Android-Keystore slots, bounded TTL/slot count, account/workspace/session
  isolation, create/update/delete process-recreation exact replay, fail-closed
  checkpoint/tombstone errors and Vietnamese support guidance passed 35/35 focused
  tests; `compileDebugKotlin`, `compileDebugUnitTestKotlin` and scoped diff-check
  are GREEN. Do not rebuild this row without a reproduced regression.
- No current source/build/local PASS is inferred from these in-flight changes.
  Deep Security remains untouched at `running/preflight`; provider/emulator/live
  proof remains `BLOCKED`, and hardware proof remains `DEFERRED — chờ phần cứng`.

1. Read this file, then only the newest context and ledger sections.
2. Inspect `git status --short` and the targeted Android diff before editing.
3. Preserve in-flight work; do not reset, stash-all, force push or stage the
   whole worktree.
4. Run the smallest focused boundary test. A closed-row PASS means continue
   forward; it does not authorize rebuilding that row.
5. Resume from the first unchecked item in the active sequence.
6. Before a long gate or planned stop, refresh this checkpoint. After closure,
   append evidence to the seven canonical handoff/status documents and replace
   this active row with the next one.

## Anti-redo rule

Quota exhaustion, context compaction, task restart or power loss never reopens
completed work by itself. A closed row reopens only when a current targeted
test reproduces a regression or an explicit compatibility review proves its
recorded contract invalid.

## 2026-08-15 active checkpoint — Phase 5 scan/audio

- Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform
  Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–4 are
  complete at their software/source/build/local gates; **Phase 5 is active**;
  Phase 6–8 remain pending. The overall plan is not PASS.
- Phase 4 final P1 is closed. Private firmware GET now refreshes the exact
  command under ownership→OTA→command lock/CAS before artifact read, expires an
  unacknowledged command + OTA atomically after delivery TTL, revokes its grant,
  and preserves execution TTL only after ACK. Proof: repository `24/24`, HTTP
  `8/8`, ownership/storage `67/67`, backend check and diff-check PASS.
- Phase 5 audio-v2 shared/firmware source-build slice is CLOSED: canonical
  `frameEncoding=shcare_audio_v2`, payload codec `pcm_s16le`, authenticated
  socket/session binding, SHC2 session/scan identity and strict sequence,
  timestamp, sample-count and flag validation. V1 raw PCM is receiver-only under
  an explicit migration flag; new firmware cannot downgrade.
- Audio-v2 evidence: shared contracts `48/48`, Web live audio `8/8`, Android live
  audio `13/13`, firmware source contract PASS, ESP32 production build PASS. The
  current Phase-5 firmware binary is `1,121,328` bytes, SHA-256
  `CC53E0084BB699BC4787FC10DD20E1AFEC3454E46A05286DE61B56671F357EF6`.
- Active Phase 5 backend RED/GREEN work: finalize recording before stop ACK,
  `audio.failed → interrupted`, exact start/stop idempotency/fingerprint, and
  restart recovery for `created` scans. Five deliberate RED tests explain the
  current aggregate `77/82`; do not call the phase PASS until they are GREEN.
- Active Phase 5 Android work: move Live Monitoring, Dashboard and Medical
  Records off direct API calls into repository/ViewModel boundaries while
  preserving native UI, authority, offline/error and device-confirmed states.
- Native firmware runtime remains `BLOCKED` without `gcc/g++`; Firebase/ADB/live
  provider evidence remains `BLOCKED`; hardware HIL remains
  **`DEFERRED — chờ phần cứng`**. Deep Security stays separate and untouched at
  `running/preflight`.

## 2026-08-22 active checkpoint — Phase 5 closed locally; Phase 6 active

- Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–5 are complete at the software/source/build/local boundary; **Phase 6 — Appointment, consent, alert và notification is active**; Phase 7–8 remain pending. The overall plan is not PASS.
- Phase 5 backend proof: device-security `82/82`; clinical workflow `8/8`; clinical dashboard status `4/4`; audio protocol `4/4`; audio processing worker `6/6`. Start/stop exact idempotency, stranded-scan recovery, failure interruption, finalization-before-ACK and audio source isolation are GREEN.
- Phase 5 Web/Portal proof: six targeted clinical/live suites `28/28`, twelve live-audio/clinical contract checks `12/12`, direct local TypeScript, ESLint and Vite client+SSR build PASS. CSS is `60.58 kB gzip`.
- Phase 5 Android proof: `116` suites / `830` tests, `compileDebugAndroidTestKotlin`, `assembleDebug` and `lintDebug` PASS. Debug APK is `26,948,657` bytes, SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`. Native clinical review is capability-gated, authority-bound and uses exact idempotency/version receipts.
- Phase 5 firmware proof remains source/build complete for SHC2 audio v2; binary `1,121,328` bytes, SHA-256 `CC53E0084BB699BC4787FC10DD20E1AFEC3454E46A05286DE61B56671F357EF6`.
- Runtime truth remains separate: Firebase config/provider and ADB/device evidence are `BLOCKED`; physical firmware HIL is **`DEFERRED — chờ phần cứng`**. Deep Security remains untouched at `running/preflight`.
- Resume only Phase 6 gaps: appointment parity, consent actor/scope/expiry/revoke/audit, alert-notification integration, field-level notification preference PATCH and FCM display/deep-link ownership. Do not reopen Phase 0–5 without a reproduced regression.

## 2026-08-22 active checkpoint — Phase 6 closed locally; Phase 7 active

- Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–6 are complete at the software/source/build/local boundary; **Phase 7 — Admin operation and remaining functions is active**; Phase 8 remains pending. The overall plan is not PASS.
- Phase 6 closes appointment, consent, alert and notification parity. Appointment deletion is now an audited, tenant-scoped, idempotent soft delete backed by additive migration `054_appointment_soft_delete.sql`; active list/detail/conflict queries exclude deleted rows and no production hard-delete path remains.
- Shared HTTP contract proof is `49/49`. Backend check, workspace access, repository, notification preference `18/18`, push `9/9` and campaign `8/8` gates pass. Portal appointment contract/component checks, direct TypeScript, ESLint and client+SSR build pass.
- Platform Admin proof: contracts `183/183`, lint and client+SSR build PASS. Android proof remains `116` suites / `830` tests with zero failures/errors/skips; AndroidTest Kotlin compile, assemble and lint PASS. APK SHA-256 is `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`.
- Resume only Phase 7: verify Patients, Doctors, Devices, Packages, Storage, Notifications, Audit, Export, Settings and manual Billing against real APIs; remove fake counts, toast-only mutations and unsupported claims; retain permission/offline/error/retry/destructive states. Do not reopen Phase 0–6 without a reproduced regression.
- Runtime truth stays separate: Firebase/provider and ADB/device proof are `BLOCKED`; physical firmware HIL is **`DEFERRED — chờ phần cứng`**. Deep Security remains separate and untouched at `running/preflight`.

## 2026-08-22 active checkpoint — Phase 7 closed locally; Phase 8 active

- Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–7 are complete at the software/source/build/local boundary; **Phase 8 — release candidate, deploy and rollback is active**. The overall plan is not yet PASS.
- Phase 7 replaced client-only full-list filtering in Patients, Doctors, Devices, Packages and Storage with one tenant-authorized backend `q/page/limit/sort` contract, stable sorting, strict invalid-query rejection, pagination headers and legacy body compatibility. Doctor facets and device/package aggregate counts now come from the full authorized backend ledger rather than the visible page.
- Phase 7 proof: shared contracts `50/50`; backend syntax/check, admin-list `3/3`, workspace-access and repository gates PASS; Platform Admin contracts `185/185`, ESLint and client+SSR build PASS; `git diff --check` reports no whitespace error.
- Resume only Phase 8: assemble a clean, intentional release candidate and demo manifest; verify product builds and local smoke from the candidate; record artifact hashes, compatibility, deploy order and rollback. Do not deploy live or claim provider/runtime/HIL proof without credentials and actual evidence.
- Runtime truth stays separate: Firebase/provider and ADB/device proof are `BLOCKED`; physical firmware HIL is **`DEFERRED — chờ phần cứng`**. Deep Security remains independent at `running/preflight`.

## 2026-08-22 Phase 8 RC2 local-demo checkpoint

- The governing plan remains **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–7 stay closed at software/source/build/local boundaries; Phase 8 remains active until required non-deferred release gates close.
- The isolated `demo:stack` launcher is verified on backend/audio/Web/Admin ports `3765/3766/8765/8766`. Backend/Web/Admin readiness returned HTTP 200; real local Admin and Portal doctor login journeys passed; Ctrl+C released every port and removed temporary data.
- RC2 aggregate: Web `390/390 + 123/123`, type/lint/build and zero-audit; Admin `186/186`, lint/build and a 72-route Chromium accessibility/permission/mutation matrix with cleanup; backend check/base/KLT/admin-list/workspace/repository and zero-audit; Android retained `116` suites / `830` tests with APK hash `BABAAA7B...`; firmware `1.0.1` production/OTA builds passed.
- Exact artifact evidence and deploy/rollback order are in **[Shcare 1.0.0-rc.2 manifest](SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md)**. Resume from the intentional product-source candidate commit and manifest finalization; do not rerun Phase 0–7 unless a current regression is reproduced.
- Live promotion remains open, but the recovery audit corrected its scope: Firebase Hosting/Admin, Supabase PostgreSQL/S3 and Android Firebase were previously configured and have retained historical evidence; they are not "never configured". The clean RC2 shell/worktree has not loaded the ignored env/service-account/`google-services.json` inputs. On `2026-08-23`, both known Render health endpoints returned HTTP `200`, but their `/metrics` payloads lack the RC2 `smart_health_legacy_*` metrics and therefore prove that the live backend is still the older revision. Migrations through `054` and current storage/provider delivery remain unverified, no ADB target is online, and Android production signing is genuinely absent. Physical HIL is **`DEFERRED — chờ phần cứng`**. Deep Security remains separate at `running/preflight`.
- Cross-engine/local-performance proof is now closed: Public Firefox/WebKit `16 + 16`; Portal Firefox/WebKit `463 + 463` across 21 routes per engine; local production-preview LCP `400ms`, INP `56ms`, CLS `0.00039`, JavaScript `200,809` bytes. Verified product-source revision is `7fd905ff91208bab0d855b1ae2d15bdb5a32c3ad`.

## 2026-08-23 Phase 8 configuration recovery correction

- Do not ask the user to recreate Firebase, Render, Supabase PostgreSQL or Supabase S3 from scratch. Retained ignored config exists in the original project checkout; Firebase Admin passed a fresh read-only Auth request and the live Web/Admin sites returned HTTP `200`.
- A missing variable in the current RC2 process proves only that this shell is not bound to the existing secret configuration. It does not invalidate prior provider/live evidence. Re-bind existing values securely and re-run only the RC2/current-live gates.
- Current open proof is narrower: promote RC2 backend source over the older healthy Render revision; verify latest database/storage state and migrations through `054`; re-prove current FCM/email/provider delivery; close Android online runtime/manual accessibility and production signing; close OTA signing/canary; and later perform physical firmware HIL. Historical emulator install/launch remains valid and ADB itself is installed; there is simply no online target now.

## 2026-08-23 Phase 8 release-source gate

- Continue only **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)** at Phase 8. Phase 0–7 remain closed unless a current regression is reproduced.
- The current verified product-source revision is `c1933d979db69ae8bc105489d1accdec9bfd0fe5`. It includes the clean-clone fix that replaces the ignored `data/db.json` dependency in `smoke:identity-migrations` with a committed synthetic fixture; focused identity and aggregate backend gates pass.
- Fresh release gates pass for backend check/test plus API/KLT/workspace/repository/identity/notification/support/role-document/2FA/device/appointment/avatar readiness; shared contracts `50/50`; Web direct TypeScript/lint/contracts/build; Admin lint/contracts/build; Android unit/compile/AndroidTest compile/lint/debug APK; firmware source/production/OTA build.
- Remote push authorization passes in dry-run. Push the RC2 branch next, then build Firebase Admin/Web previews with retained external env. Do not merge `main` or promote live until migrations `044–054`, Render start mode, preview CORS, rollback and cleanup-safe authenticated smoke are proven.
- Android production signing, current FCM/device/manual TalkBack, OTA signing/canary, provider delivery and Deep Security remain open. Physical firmware HIL remains **`DEFERRED — chờ phần cứng`**.

## 2026-08-24 active checkpoint — G3 security closure and release preflight

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. G0–G2 remain complete, G3 remains active, and G4 remains pending. Do not rebuild completed integration/UI work without a reproduced regression.
- Durable Deep Security scan `1b48646c-c3fe-4835-9526-92177be380ae` is finalized and sealed: `8` findings (`1 critical`, `2 high`, `4 medium`, `1 low`). Confirmed paths have source remediations or were revalidated as already safe; focused security, notification, PHI persistence, workspace, repository and KLT gates pass.
- Current identity: base HEAD `1c902b29405717c28d8dfa908e4eeb16137971cc`, intentional dirty snapshot hash `dc3e7457f923ddb2483e9e12aff0a6205d58aff5`. Preserve the worktree; do not reset, stash-all or stage unrelated files.
- Fresh evidence: backend check/test and affected domain smokes pass; Web/Admin lint, contracts and production builds pass; Android has `831/831` unit tests, AndroidTest Kotlin compile, lint and debug APK build with SHA-256 `9B58268A123FB66CFD4139CF3F47C8C13F491EAC0BE0CACDAEA416ED0D866C62`; production/development firmware builds pass.
- G3 is not yet PASS. Remaining work is browser smoke after the security diff, candidate manifest/hash freeze, live/provider and production credential preflight, Android runtime when a target is online, and secure-device WSS/ACK/OTA proof. Native PlatformIO host tests are blocked by missing host `gcc/g++`, not a firmware compile failure. Production firmware SHA-256 remains `A31F9F6B32AF05F253AEB5D00063F8BA0318D6C9965CB0F9EE01B9CB02E54004`; physical two-mic I2S HIL remains valid.
- Current browser-diff smoke is green: Public `17`, Auth forgot-password `17`, Portal `478` across all 21 routes in the selected phone/light case, and Admin Storage mobile/system with accessibility/theme/overflow/console/request checks. Historical full Chromium/Firefox/WebKit matrices remain valid because the security diff did not alter those UI routes.
- Release preflight: Firebase CLI access to active project `smart-health-stethoscope` is valid; both Hosting sites return HTTP `200`; both known Render backends return HTTP `200` at `/api/health` and `/api/v1/health`, while `/metrics` still lacks the RC2 legacy markers and proves the live backend is old. The current shell has no production secret env bound, so PostgreSQL/S3/PHI migration/provider readiness remains unverified rather than “never configured”.
- Hardware was re-detected on `COM9`; esptool read the physical ESP32-S3 directly and confirmed `16MB` flash plus `8MB` PSRAM. No reflash is required while the production firmware hash is unchanged.

## 2026-08-24 active checkpoint — G3 Firebase preview verification

- Resume only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. G0–G2 are complete; G3 is in progress; G4 is pending. This checkpoint does not reopen earlier work.
- Integration source was frozen at `9a4855a4f286b77c35470dfc92e269a6504ef111`; the focused Auth production-CSS correction is `927b171132d834acfe6a52bb7f3ab7e6e6d7189a`. Web/Admin backup and preview channels exist and no live promotion has occurred.
- Web preview Auth passes 360 px `light|dark|system`, no overflow/console error, backdrop disabled, and recovery-button contrast above WCAG AA. Anonymous Admin `/storage` correctly reaches the protected login route; route/capability tests retain authorized Storage navigation.
- Current blocker: the old live backend returns the Admin live origin for CORS requests from both exact preview origins. Authenticated preview mutation/cleanup proof cannot be truthful until backend CORS, production secrets and migration `055` are released safely. Production secure-device WSS/auth/ACK/forced OTA rollback proof also remains open. Therefore G3 is not PASS and G4 has not started.
- On restart, first read this checkpoint and the RC2 manifest, then continue only with the CORS/backend production-readiness and secure-device evidence. Never redeploy the already-green preview blindly and never redo G0–G2 without a reproduced regression.

## 2026-08-24 active checkpoint — G3 in-app/local Web Wi-Fi provisioning

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. G0–G2 remain complete, G3 remains in progress and G4 is pending. The exact source checkpoint for this row is `bb8b5f4ea31e5ff6c798007d70cf1ef2dcc372a5`.
- The production user flow no longer requires editing firmware flags or `setup-access.json`: Android claims/scans the device, requests the version-correct nearby-Wi-Fi permissions, binds a raw local socket only to the selected ESP setup network, sends target Wi-Fi through the device-bound session API and starts backend presence polling only after HTTP `202`. The captive Web portal remains the nearby-browser fallback with Vietnamese, responsive light/dark UI.
- Android proof: `117` suites / `838/838`, failures/errors/skipped `0`; compile, full unit, AndroidTest compile, lint and debug assemble pass with `No issues found`. The automatic path is primary and the credential/browser fallback stays collapsed until explicitly requested. APK is `26,954,873` bytes, SHA-256 `2D33500435F0B7A7A2851648D1672D6973CE3263AE2800828E4063CB61EBFFDB`.
- ESP proof: `54/54` Unity tests executed on the physical ESP32-S3 through `COM9`; the setup JSON parser/session binding test passes. Production image build is `1,130,768` bytes, SHA-256 `5B61DDAD78613DEB6A1EB4ECFF1C2035C791666838057D5EC71AFC01551EC828`. The application HIL image was restored to the board afterward.
- Physical captive-portal HIL passes HTML contract, exact device/session binding, invalid-CSRF rejection and automatic restoration of the PC Wi-Fi profile. A final serial reset proves port `80`, the setup AP and both I2S mic slots remain active. HIL JSON is internal evidence only and is not a user instruction surface.
- Still open: no ADB target is online, so the in-app network-selection dialog and complete App runtime journey remain `BLOCKED`; a successful POST using the real target-network password must be performed only when the user enters that password in App/Web. Production CORS/provider/migration, secure WSS/ACK and forced OTA rollback gates also remain open, so G3 is not PASS.
