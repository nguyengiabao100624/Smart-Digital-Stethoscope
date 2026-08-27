# Smart Health - Project Index

## Current G3 provisioning pointer — ESPTouch V2 dual-band router flow

- Android source of truth: `smart-health-android/app/src/main/java/com/example/smart_health_android/devices/DeviceWifiProvisioner.kt`; it selects the exact 2.4 GHz BSSID for the current combined-router SSID with Android `WifiNetworkSpecifier` and broadcasts ESPTouch V2 AES-128. It has no BLE, ESP SoftAP, local HTTP `192.168.4.1`, browser or Settings workflow.
- Current proof: focused 37 Android tests, `:app:lintDebug`, `:app:assembleLocalDemoDebug`, merged-manifest inspection (no Bluetooth/nearby-device permission) and Xiaomi install passed. Installed APK SHA-256: `30002978605139CA73B8618479DE72CBF2DFBC32E8DF7A9228A83A8EB3696C5D`.
- Open evidence only: secure on-device password entry/system confirmation, ESPTouch listener, association/DHCP, authenticated WSS, command ACK, audio-v2, durable scan, signed OTA and rollback. Do not close G3 or begin G4.

## Latest ESPTouch V2 hardware checkpoint

- COM9 normal firmware SHA-256 `623072C1A59C05312F318712A99E0570806DBCE1814A7E637236C0C89516B647` is flashed with esptool write verification; its OTA counterpart is `AFAA53C90A3B5F0C13AA8470500AE91FA6AC7ECCF042EF6ACD3EE763F3CFE806`. Boot serial confirms the KDF golden-vector self-test and ESPTouch V2 listener.
- Xiaomi has LAN APK SHA-256 `CB018EE8815FD0222D8B261B9A34820AE878083298ED01FC471A27C981A4F62C` installed.
- This is not end-to-end provisioning proof: keyguard blocks the protected Wi-Fi field, therefore Broadcast, association/DHCP and WSS remain open.

## Current integration pointer - G3 ESPTouch V2 Broadcast

- Customer provisioning source: backend `web-monitor/src/deviceSmartConfigSecurity.js`, Android `devices/DeviceWifiProvisioner.kt`, and firmware `MSM261S4030H0/src/main.cpp`.
- Contract: DeviceManage setup-session emits V2 AES-128 key + reserved Device-ID binding; Android broadcasts it on the current 2.4 GHz Wi-Fi; firmware checks binding, association/DHCP, then WSS presence is final confirmation.
- Current evidence is source/build only: backend device security `83/83`, Android main/test compile plus focused V2 unit test, and ESP32-S3 normal build. COM9 flash, Xiaomi APK and end-to-end HIL are still open; G3 is active and G4 is pending.

## Current integration pointer - G3 SoftAP physical chain

- Plan: [SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md); G0-G2 complete, G3 active, G4 pending.
- Android source: `smart-health-android/app/src/main/java/com/example/smart_health_android/devices/DevicePairingViewModel.kt` and `ui/screens/DevicePairingScreen.kt`. The Wi-Fi form opens SSID/password directly; reading the current SSID is an explicit helper action so no system permission dialog overlays initial entry.
- Fresh proof: Android unit `856/856`, lint `0` errors / `3` warnings, Xiaomi `PhysicalDeviceProvisioningHilTest` `OK (1 test)`, backend device-security `83/83`, setup security `3/3`, firmware source/normal/OTA builds. LAN APK `00BC681014D3A0CBB73DC6575B1621B9A64A75491359480447A5AF32231EFA3F` is installed.
- Hardware: COM9 is ESP32-S3 rev 0.2 with 16 MB flash and 8 MB PSRAM. Current SoftAP firmware is flashed with verified writes. Next boundary is target password entered only in the on-device field, followed by physical association/WSS/ACK/audio-v2/durable-scan/OTA rollback evidence.

Last updated: 2026-08-26

## Current integration pointer — G3 physical claim proof

- Plan: [SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md); G0–G2 complete, G3 active, G4 pending.
- Latest physical gates: `smart-health-android/.../devices/PhysicalDeviceBleClaimHilTest.kt` (`1/1` canonical claim) and `CurrentWifiSsidHilTest.kt` (`1/1` current SSID); focused JVM pairing/BLE contract proof `38/38`.
- Firmware identity: `smart-health-embedded/MSM261S4030H0/platformio.ini` uses the checked 16-MB OTA table; a COM9 read-only probe confirms the attached ESP32-S3 rev v0.2 has 16 MB flash. No upload was performed in the verification.
- Next boundary: normal Android Nearby Bluetooth permission, then encrypted BLE provisioning and server/device evidence. Never place pairing artifact values or a Wi-Fi password in source, commands or handoff notes.

## Current integration pointer — G3 QR gallery input

- Plan: [SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md); G0–G2 complete, G3 active, G4 pending.
- Android source: `smart-health-android/app/src/main/java/com/example/smart_health_android/devices/DeviceQrImageDecoder.kt`, `DevicePairingViewModel.kt`, and `ui/screens/DevicePairingScreen.kt`.
- Resume proof and limits: `SMART_HEALTH_ACTIVE_CHECKPOINT.md`; fresh pairing JVM `33/33`, the current LAN APK hash is `897775F474DB1EC306DED901B9985FC6234860851279322C73944898A558D34F`, and the Xiaomi must be unlocked for physical picker verification. Do not use `setup-access.json` or any Wi-Fi password as a user workflow.

This is the fastest navigation file for `D:\Study\KLTN`. Read it before opening broad folders or scanning the whole workspace.

Current master-plan state: Phase 0–3 complete; **Phase 4 — Device provisioning
và command** in progress. The exact restart row and active remediation list live in
`docs/SMART_HEALTH_ACTIVE_CHECKPOINT.md`; that file overrides older historical
status paragraphs but never replaces `docs/SHCARE_REBUILD_MASTER_PLAN.md`.

## Phase 4 Candidate Snapshot

- Current source/build/local evidence: shared `44/44`; backend check and
  device-security `42/42`; Web contracts `122/122`, claim `10/10`, device-route
  subset `8/8`; Admin `183/183`; Android `108` suites / `781` tests, devices
  `48/48`, main/AndroidTest compile, lint and assemble. Android APK SHA-256 is
  `F32C7C3A85E40A217ACC8AEEC2DDF6DD0DA6694FA69B53BC4AF94263DD6828FE`.
- Firmware source-contract and MCU compile-only (`0` executed) pass. Normal and
  OTA images are both `1,104,640` bytes with SHA-256
  `CB2B0A8749697FEEB14F4720E64A0CF8629109CDF6377784B7DB7F6CB2BAA7B5` and
  `CA79DE814DAC8D6BB3A48EB87F80E6ADDF331C62009129C013C250F30A074801`.
  Independent re-review found no remaining blocker in the four-item firmware
  remediation scope; prior firmware hashes are superseded pre-remediation proof.
- Phase 4 remains in progress because cross-surface review reopened five P1s:
  generic Admin command must exclude revoke/rotate/OTA/audio types; SQL pair
  must share the ownership lock/current row; pair contract + Portal + Android
  must bind exact active workspace and receipt/poll authority; Admin revoke needs
  a stable `Idempotency-Key`; shared/OpenAPI needs command/revoke/rotate/OTA
  contracts.
- Native C++ execution is unavailable because host `gcc/g++` and equivalents
  are absent. HIL/flash/serial/I2S/WSS/rollback/16 MB proof remains
  `DEFERRED — chờ phần cứng`.

## Start Here

Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform
Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Restart authority:
**[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.

Read in this order:

1. `docs/SMART_HEALTH_ACTIVE_CHECKPOINT.md` - current unfinished row and the
   exact restart point after quota exhaustion, compaction or power-off.
2. `docs/SHCARE_REBUILD_MASTER_PLAN.md` - the complete, user-approved governing
   plan; do not replace it with an internal slice label or a narrower plan.
3. `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md` - current state, product direction, latest verified work.
4. `docs/SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` - accepted rebuild plan execution order, bug ledger, cross-surface impact records, proof classes and current phase evidence.
5. `docs/SMART_HEALTH_KLTN_REPORT_COMPLETION_PLAN.md` - KLTN/report gate, required evidence, what to finish before more product development.
6. `docs/khoaluan/README.md` - KLTN contract pack: unified system contract, audio packet/WebSocket contract, demo evidence checklist, and gap/test matrix.
7. `docs/SMART_HEALTH_PROMPT_REQUIREMENTS_HANDOFF.md` - broad prompt ledger, product invariants, closed slices, blockers, and next non-repeated slice.
8. `docs/SMART_HEALTH_IMPLEMENTATION_STATUS.md` - what is real, partial, scaffold, or still missing.
9. `docs/SMART_HEALTH_PRODUCTION_BACKLOG.md` - next production slices in priority order.
10. `docs/SMART_HEALTH_COMMANDS_GUIDE.md` - commands, envs, smoke tests, deploy notes.
11. `docs/SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` - Vietnamese operational setup checklist.

For product decisions, also read:

- `docs/SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`
- `docs/SMART_HEALTH_THIRD_PARTY_SETUP.md`
- `docs/SMART_HEALTH_AGENT_SKILLS_GUIDE.md`
- `docs/SMART_HEALTH_RULES_AND_SKILLS_AUDIT_2026-07-10.md`

## Whole-System Scope Contract

Smart Health means the full `D:\Study\KLTN` product system, not only one app or folder. Treat `smart-health-embedded`, `smart-health-android`, `smart-health-admin`, `smart-health-web`, Firebase, Render, Supabase/Postgres, object storage, firmware, smoke tooling, CI/deploy scripts, and the handoff docs as one connected product.

For any feature or fix, trace the user-facing workflow end to end before calling it done: backend API and repository policy, auth/role/tenant logic, web portal behavior, admin behavior, Android behavior when relevant, firmware/device behavior when relevant, live/provider data, tests/smokes, deploy impact, and docs/handoff. Do not complete isolated UI or backend changes when the adjacent client, permission model, smoke coverage, or production runbook also needs to change.

## KLTN Contract Pack

For thesis-focused work, use `docs/khoaluan` as the contract source before adding more production-development scope:

- `docs/khoaluan/01-system-contract.md` maps actors, roles, entities, states, data ownership, and implemented/partial/future claim levels.
- `docs/khoaluan/02-audio-packet-and-realtime-contract.md` locks the current PCM16 16 kHz mono audio packet, firmware WSS/UDP behavior, backend `/app`/`/esp` realtime events, Android live-audio expectations, and simulated-evidence rule.
- `docs/khoaluan/03-demo-and-evidence-checklist.md` lists the repeatable demo/evidence commands and required artifacts.
- `docs/khoaluan/04-test-matrix-and-gap-log.md` records the KLTN module matrix, gaps, blockers, and minimum demo definition of done.

Backend `smart-health-embedded/web-monitor` now has `npm.cmd run smoke:klt-contract` to check that those docs exist and the firmware/backend/Android source still matches the documented KLTN audio contract.

## Active Source Map

| Area | Path | Notes |
| --- | --- | --- |
| Backend API / monitor | `smart-health-embedded/web-monitor` | Node.js backend, repository layer, migrations, smoke scripts, WebSocket/audio/device APIs. |
| Production firmware | `smart-health-embedded/MSM261S4030H0` | Only active ESP32-S3 firmware target. INMP441 is retired. |
| Android app | `smart-health-android` | Kotlin/Jetpack Compose app, Firebase-backed role/session flows, FCM token registration. |
| Shcare portal | `smart-health-web` | Public site plus doctor/clinic Workspace Portal at `https://shcare.web.app`. |
| Platform admin | `smart-health-admin` | Platform Admin Console at `https://shcare-admin.web.app`; UI source is in the Vietnamese-named design folder. |
| Firebase local credentials | `firebase` | Local secret/service-account folder. Keep out of Git. |
| Thesis/report docs | `docs`, root report folders/files | Human/report artifacts. Do not delete without explicit confirmation. |

## Live Surfaces

| Surface | URL |
| --- | --- |
| Shcare Workspace Portal | `https://shcare.web.app` |
| Platform Admin Console | `https://shcare-admin.web.app` |
| Backend API | `https://smart-health-api-r5is.onrender.com/api` |
| Firebase project | `smart-health-stethoscope` |

## Current Latest State

- The governing plan is **“Kế hoạch tái thiết toàn diện Shcare Web, Portal,
  Platform Admin, Android và firmware”**. The only user-visible progress model
  is Phase 0–8: Phase 0–3 are complete; **Phase 4 is in progress**; Phase 5–8
  remain pending. Resume the five active P1 remediations in the candidate
  snapshot; do not reopen earlier phases without a reproduced regression.

- Historical pre-rebaseline slices labeled Phase 5/6–7 in the older ledger are
  retained as source/build/local evidence only; they do not advance the current
  master-plan overview beyond Phase 4. Their tenant remediation, contract and
  targeted-browser proof remains reusable, while live migration/promotion,
  PostgreSQL/Redis/provider, Android runtime/device and physical firmware proof
  remain separate. Use `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` for the exact
  historical evidence and blockers.
- Firebase Auth is the identity provider across Android, Web Admin, and Shcare Portal.
- Current Render backend is `https://smart-health-api-r5is.onrender.com` (`/api` base `https://smart-health-api-r5is.onrender.com/api`). The previous `smart-health-api-xj0a` workspace hit the free outbound bandwidth limit and is no longer the active production URL.
- Render, Firebase Hosting/Auth, Supabase Postgres, and Supabase S3-compatible storage were already set up earlier; do not ask to recreate Firebase/Supabase from scratch. Render was recreated in the new workspace on 2026-07-09 because Render does not support direct service transfer between workspaces.
- Supabase connector access is available for production-like DB inspection. On 2026-07-07 it confirmed project `smart-health-production` (`mahvymyncxszvuhlycwp`), applied migrations `001`-`008`, RLS-enabled public tables, no direct `anon`/`authenticated` grants, and no permissive public policies.
- `MSM261S4030H0` is the only active firmware target. Do not route new work to INMP441.
- Shcare Web registration email verification now uses a backend-generated Firebase verification link delivered through the outbound email provider stack.
- Backend notification creation now has a Firebase Cloud Messaging delivery path for direct user notifications, records push delivery status separately from platform-admin email fanout, persists per-attempt `pushAttempts` history without raw FCM tokens, and retries retryable provider failures with bounded env controls.
- Phase 6–7C adds recipient-scoped notification campaigns with workspace/role/user audiences, required idempotency, transaction audit, separate in-app/email/push outcomes and provider availability. Admin owns the campaign UI; Web/Android consume delivery state through separate platform UX. Live migration 041 and provider/device delivery remain `BLOCKED`.
- As of 2026-07-07, backend/source commit `88877ad5` (`Ship Smart Health tenant hardening and live smokes`) and docs commit `b12a16f6` (`Document Smart Health live deploy verification`) are pushed to `origin/main`. Render auto-deploy was verified through live health and public/role/portal/admin smokes.
- As of 2026-07-09, `shcare.web.app` is deployed at Firebase Hosting version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`, release `projects/162993928259/sites/shcare/channels/live/releases/1783550011942000`, built against `https://smart-health-api-r5is.onrender.com/api`. `shcare-admin.web.app` is deployed at version `projects/162993928259/sites/shcare-admin/versions/0d796ccc2368d21e`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783598280968000`, built against the same backend.
- The 2026-07-09 Render/Firebase migration verification passed: backend `/api/health` and `/api/v1/health` returned 200, `/api/me` returned expected 401 unauthenticated, backend `check`, public deployment smoke, production-role smoke, portal production smoke, Shcare portal browser smoke, portal mutation smoke run `portal-mutation-mrce7zqs`, and admin mutation smoke run `admin-mutation-mrcebq30`.
- Shcare Portal unauthenticated deep links such as `/portal/patients` now redirect to `/login` without the previous `No QueryClient set` crash or React maximum-update-depth console failure.
- Shcare Portal login no longer exposes raw Firebase `auth/invalid-credential` errors. Invalid credentials render safe Vietnamese guidance and platform-admin accounts are directed to `shcare-admin.web.app`.
- Live authenticated portal API smoke is available through `npm.cmd run smoke:portal-production` after `npm.cmd run smoke:production-roles`; it verifies platform portal rejection plus workspace-admin and doctor read paths against Render.
- Authenticated Chrome smoke on the deployed `shcare.web.app` confirmed workspace-admin and doctor read routes without runtime console warnings; portal form controls now have stable `id`/`name` attributes.
- The 2026-07-09 live `bun run smoke:portal-browser` and `bun run smoke:portal-mutation` evidence remains historical for the then-current implementation. Its “support cleanup” deleted a synthetic self-notification and is **not** evidence for the new durable support ledger. The current smoke still covers the other controlled create/restore/delete flows, but support creation is skipped by default until a requester withdrawal/cleanup contract exists; explicit durable-ticket opt-in must report cleanup as blocked. A custom no-query-leak smoke also confirmed pre-hydration/native form submit did not expose credentials in URL query strings.
- Live `npm.cmd run smoke:admin-mutation` passes from `smart-health-admin\thiết kế giao diện` after refreshing production role credentials. It covers controlled Web Admin workspace/package/patient/device/notification/storage/settings mutations against live Render/Admin and cleans up every created/restored resource.
- Web Admin lint is warning-free after the Fast Refresh mixed-export cleanup; PDF export font bloat was moved out of TypeScript bundles into `public/fonts/roboto-regular.ttf`.
- Follow-up on 2026-07-09 filled the Shcare Portal `/portal/settings` gap and is now live on `shcare.web.app`: the route includes profile, avatar, password, 2FA, sessions, notification preferences, and workspace settings backed by `/me/*` and `/auth/sessions`. Verification passed locally with `bunx tsc --noEmit`, `bun run lint`, `bun run build`, `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-browser`, and local mutation run `portal-mutation-mrclhqx7`; then `bun run build:firebase`, Firebase Hosting deploy target `webapp`, live `bun run smoke:portal-browser`, and live `bun run smoke:portal-mutation` run `portal-mutation-mrclugrb` passed without the local CORS bypass flag.
- Follow-up on 2026-07-09 fixed and deployed the Shcare Portal density/search-field regression from the user screenshot: commit `ff9adec5` normalizes portal title/text/input/button/table sizing and applies a shared `.portal-search-field` to Patients, Records, Audit Log, and Help so search icons no longer overlap placeholders. Firebase Hosting `shcare` version `projects/162993928259/sites/shcare/versions/a1b568cf873aac0d` / release `projects/162993928259/sites/shcare/channels/live/releases/1783594254847000` is live. Verification passed with Shcare Web typecheck/lint/Firebase build, local and live `bun run smoke:portal-browser`, `npm.cmd run smoke:public-deployment`, and Playwright visual QA measuring `21.44px` portal titles, `44px` search inputs, about `12.809px` icon-to-text gap, and zero checked overflow.
- Same-turn follow-up density sweep checked 19 live portal routes for overflow, H1 scale, portal input/search/button dimensions, search icon gap, logo image loading, and severe console/page errors; it passed with `failing=[]` and `severe=[]`.
- Same-turn provider/device re-probe passed backend/source smokes, local storage/notification/API smokes, Firebase email-link generation, live public/role/portal/browser smokes, Android compile/debug assemble/unit tests, and PlatformIO normal/OTA firmware builds. Remaining blockers are external access: no attached Android device from `adb devices`, no ESP32-S3 serial device from `platformio device list`, no backend production `.env` with S3/Postgres/PHI provider secrets in this shell, no authenticated mailbox for inbox click-through, and `MQTT_URL` unset.
- 2026-07-10 KLTN gate follow-up added `docs/khoaluan` as the unified thesis contract pack and backend `npm.cmd run smoke:klt-contract` as a source-contract smoke. This closes the missing thesis-contract documentation gap, but it does not replace physical ESP32-S3/MSM261S4030H0 proof or Android device/emulator runtime proof.
- Web Admin production env guard now rejects the retired `smart-health-api-xj0a` Render URL and requires `VITE_SMART_HEALTH_API_BASE_URL` to match `VITE_SMART_HEALTH_BASE_URL + /api`. The local `.env.production` was corrected to `https://smart-health-api-r5is.onrender.com`, Web Admin lint/build/deploy passed, and live `npm.cmd run smoke:admin-mutation` passed with run id `admin-mutation-mrdgdbok` against `https://smart-health-api-r5is.onrender.com/api`.
- Emulator safety: do not auto-boot `Pixel_8_Pro_2` with AEHD/hardware acceleration. Boot attempts produced Windows `0x133 DPC_WATCHDOG_VIOLATION` bugchecks. The AVD now lives at `D:\Android\avd\Pixel_8_Pro_2.avd`, AEHD is stopped/demand-start, the AVD is set to cold boot with SwiftShader and 2 CPU cores, and Windows `HypervisorPlatform` has been enabled with `hypervisorlaunchtype Auto`. Current boot still reports `HypervisorPresent=False`, so a controlled restart is required before retrying WHPX-accelerated emulator QA. A no-accel boot did not crash the host but stayed `emulator-5554 offline`, so it is not a usable Android QA path.
- Follow-up on 2026-07-09 closed and deployed the Shcare Portal workspace summary contract: commit `2b3d21a3` is pushed to `origin/main`, `/portal/workspace` no longer uses hardcoded zero counters, backend `/me` returns operational summaries for current workspace and memberships, and Firebase Hosting `shcare` version `projects/162993928259/sites/shcare/versions/4f370368cfbe2403` / release `projects/162993928259/sites/shcare/channels/live/releases/1783592537850000` is live. Verification passed with backend `check`, `smoke:workspace-access`, Shcare Web typecheck/lint/Firebase build, `smoke:public-deployment`, live `smoke:portal-production`, live `bun run smoke:portal-browser` without the local CORS bypass, and live mutation run `portal-mutation-mrdczthd` with cleanup.
- Follow-up on 2026-07-09 filled the Shcare Portal `/portal/consent` workflow gap and is now live on `shcare.web.app`: workspace users can select patient, doctor/workspace target, full-profile or selected-scan scope, optional expiry, list active shares, and revoke shares. Verification passed with typecheck/lint/build/Firebase build, local preview browser/mutation smokes, Firebase deploy version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`, live browser smoke, and live mutation run `portal-mutation-mrcnnzcg` creating/revoking share `share_20260708223625_e69f019e`.
- Follow-up on 2026-07-09 moved patient-share grants toward repository-backed persistence: backend source now has `repositories.patientShares` for SQL-backed list/find/save/revoke, portal share routes use it when available, `migrateJsonToPostgres.js` carries existing runtime shares, and `db/migrations/009_doctor_patient_access_runtime_parity.sql` adds `doctor_id`, `scope`, `scan_ids`, revoke metadata, nullable doctor user, and share indexes. Supabase production schema `mahvymyncxszvuhlycwp` has app migration `009_doctor_patient_access_runtime_parity` applied and verified. Local verification passed with backend syntax checks, `smoke:repositories`, `check`, `test`, and `smoke:workspace-access`; live API create-list-revoke consistency is verified, while row-level proof for newly-created live Supabase share rows still needs DB/log access.
- Follow-up on 2026-07-09 closed the Android/patient family consent-history backend contract locally and pushed commit `fde6ae4c`: `GET /api/v1/patients/:id/shares` returns revoked grants for history, and `smoke:workspace-access` now logs in a personal patient account to verify self/dependent profile isolation, dependent creation, doctor share-target lookup, consent create/list/revoke, revoked-history visibility, and denial of workspace-owned patient profiles. Android source/build verification also passed for `DataAccessScreen.kt`; live public deployment smoke passed, and authenticated portal production smoke passed on rerun after one transient Render 502.
- Follow-up on 2026-07-09 closed the Android account password backend bridge locally: `ChangePasswordScreen.kt` now updates Firebase, refreshes the backend API token, and records the change through `/api/v1/me/password` with `firebaseClientUpdated=true`; demo/backend sessions still use current/new password directly. `smoke:workspace-access` verifies backend password change, old-password rejection, and new-password login for the seeded patient account.
- Follow-up on 2026-07-09 closed Android Privacy 2FA setup-state parity locally: `PrivacyScreen.kt` now loads/updates backend `/api/v1/me/2fa`, `AuthUser` parses backend 2FA fields, recovery codes are shown after enable, biometric is clearly unavailable until native BiometricPrompt exists, and `smoke:workspace-access` verifies patient 2FA enable/disable with recovery-code response.
- Follow-up on 2026-07-09 closed Android Privacy auth-session parity locally: `PrivacyScreen.kt` now lists backend `/api/v1/auth/sessions`, marks the current session, and revokes non-current sessions. Backend demo auth fallback now rejects invalid/revoked bearer tokens instead of falling back to the platform admin demo user, and `smoke:workspace-access` verifies patient session list/revoke plus revoked-token denial.
- Follow-up on 2026-07-09 closed Android family profile management locally: Settings now includes `Hồ sơ gia đình`, `FamilyProfilesScreen.kt` lists/creates/updates/deletes dependent profiles through backend patient APIs, and `smoke:workspace-access` verifies patient profile create/update/delete plus cross-workspace update denial.
- Follow-up on 2026-07-09 closed Android workspace switcher parity locally: Android now parses backend `currentWorkspace`, `currentMembership`, and `memberships`; Settings exposes a Workspace route; doctor/patient dashboards show current workspace context; and backend smoke verifies a joined doctor can switch workspace through `/api/v1/me` and switch back. Verification passed with backend `node scripts\workspaceAccessSmokeTest.js`, Android `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, and `.\gradlew.bat :app:testDebugUnitTest`. Real emulator/device visual proof is still pending.
- Global/project rules now require a Smart Health skill bundle for broad work: `smart-health-project` plus context-budget/strategic-compact, then every materially useful UI/UX, implementation, QA, security/auth/data, deploy, and handoff skill for the touched surfaces. Do not collapse future "complete everything" requests to one route or one skill.
- Local strict production readiness can still report `BLOCKED` when Render/Supabase/Firebase/provider secrets are not loaded into the current PowerShell process.
- Backend repository hydration now treats normalized SQL rows as authoritative even when SQL tables are empty, preventing stale runtime snapshot rows in Postgres-backed mode. `smoke:repositories` covers this plus optional FK guard SQL for user/patient/device links.
- Commit `6d902355` deployed the repository hydration hardening. Live public deployment smoke and authenticated portal production smoke passed, and Supabase confirmed runtime/normalized counts are synced again (`organizations=10`, `users=12`).
- Backend workspace smoke now covers storage share URL, authenticated local-object reads, direct download content, cross-workspace signed URL/download denials, upload/list/download/delete, and post-delete 404.
- Shcare Web has `bun run smoke:performance` for live public/portal performance regression. It passed on `https://shcare.web.app`; public home transferred about 4.45 MB and loaded in about 0.8-5.1s across reruns, while authenticated portal routes loaded in about 0.4-1.3s after login.
- Commit `edd419ef` pushed the storage/performance smoke follow-up. Post-push live public deployment smoke and authenticated portal production smoke passed.
- Commit `27f309be` fixed a Web Admin live mutation regression where a background `/devices` list could drop a just-provisioned runtime device before PATCH when normalized SQL did not yet include it. Post-deploy live `npm.cmd run smoke:admin-mutation` passed with run id `admin-mutation-mran2ji6` and HTTP 200 cleanup for settings, notification, storage bucket, device, patient, package, and workspace.
- 2026-07-10 source follow-up closed the backend audio worker persistence gap: `scripts/worker.js` now persists BullMQ audio job output through `src/audioProcessingWorker.js` into scan/audio/AI repositories instead of only logging results, and scan complete/reprocess avoids duplicate inline + queued processing when Redis enqueue succeeds. Verification passed with backend `npm.cmd test`, `npm.cmd run check`, `npm.cmd run smoke:workspace-access`, and `node scripts\worker.js` without `REDIS_URL` returning the expected disabled message. Live Redis/BullMQ runtime proof still needs queue envs.
- 2026-07-10 follow-up closed and deployed the missing Shcare Portal appointments/consultations module before ESP32 work: commit `b9a6d4cb` is pushed to `origin/main`, Supabase production migration `20260710054623 appointments` is applied and verified for table/columns/indexes/constraints, Firebase Hosting `shcare` version `projects/162993928259/sites/shcare/versions/044ec7e04023ffb8` / release `projects/162993928259/sites/shcare/channels/live/releases/1783662693801000` is live, and live smokes passed. Evidence includes backend public/production-role/portal-production smokes, live portal browser smoke seeing `/api/portal/appointments` HTTP 200, and live mutation run `portal-mutation-mreisktg` creating appointment `appt_20260710055434_71922d95`, confirming it, deleting it, and cleaning up.
- Firebase Admin smoke can run locally by setting `FIREBASE_PROJECT_ID=smart-health-stethoscope` and `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file under `D:\Study\KLTN\firebase`; `smoke:production-roles`, `smoke:portal-production`, `smoke:firebase-email`, and `smoke:public-deployment` passed on 2026-07-07.
- Later 2026-07-07 full rerun passed backend `check`, `test`, `smoke:storage`, `smoke:notification-push`, `smoke:api-production`, `smoke:workspace-access`, `smoke:repositories`, Shcare Web `smoke:portal-browser`, `smoke:portal-mutation` run `portal-mutation-mraqouwy`, `smoke:performance`, lint/typecheck/Firebase build, Web Admin `smoke:admin-mutation` run `admin-mutation-mraqkmzo`, lint/Firebase build, Android debug/release builds, and MSM261 PlatformIO normal/OTA builds. `smoke:mqtt` skipped because `MQTT_URL` is unset.
- Gmail inbox receipt/click-through, real Android FCM, and physical ESP32-S3 validation remain unclaimed: Gmail was not signed in, `adb devices` showed no attached Android device, and PlatformIO returned no ESP32-S3 serial device.

## Safe Cleanup Rules

- Do not delete, move, or overwrite report files, Word documents, screenshots, CV files, or folders that may contain user data unless explicitly confirmed.
- Ignore local tool/cache folders instead of committing them: `.config/`, `.impeccable/`, `.npm-cache/`, and `codex-telegram-bridge/`.
- Keep generated build output out of Git: `dist/`, `dist-firebase/`, `.firebase/`, `.vite/`, `.tanstack/`, `.lovable/`, PlatformIO `.pio/`, Android `build/`, Gradle caches, logs, and local secret files.
- Keep shared skills/tools global under `C:\Users\baobe\.codex\skills` or `C:\Users\baobe\.agents\skills`; do not recreate repo-local `.agents/skills`, `.ai_skills`, or `skills-lock.json`.
- Before staging/committing, use scoped status/diff commands so unrelated dirty files do not get mixed into the change.

## Common Focused Checks

Backend:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:klt-contract
npm.cmd run check
npm.cmd run check:audit-export
npm.cmd run smoke:audit-export
npm.cmd run smoke:workspace-access
npm.cmd run smoke:repositories
npm.cmd run smoke:identity-migrations
npm.cmd run smoke:public-deployment
```

Authenticated portal production API:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:production-roles
npm.cmd run smoke:portal-production
```

Notification push:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:notification-push
```

Shcare Web:

```powershell
cd D:\Study\KLTN\smart-health-web
bun run lint
.\node_modules\.bin\tsc.cmd --noEmit --pretty false
bun run test:auth
bun run test:contracts
bun run build:firebase
bun run smoke:portal-browser
bun run smoke:portal-mutation
```

Web Admin:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:production-roles

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run test:contracts
npm.cmd run lint
npm.cmd run build:firebase:admin
npm.cmd run smoke:admin-operations-browser
npm.cmd run smoke:admin-mutation
```

Android:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

Firmware:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

## Remaining Practical Work

- Do not repeat the closed Role/Auth/Register/Approval/RBAC, repository parity, local storage API, live performance, live portal mutation, or admin mutation slices unless new regression evidence appears.
- Confirm real inbox receipt/click-through for production email verification after Gmail is signed in or a mailbox/API credential is available.
- Run real Android FCM delivery with a real device token against Render after `adb.exe`/Android SDK is accessible and a device is attached.
- Run production S3/Supabase Storage provider smoke with provider envs loaded in the shell or host running the smoke.
- Flash the real MSM261 ESP32-S3 board and capture serial evidence for WiFi, heartbeat, audio, cloud command, and OTA after the ESP32-S3 appears as a real serial device.

### 2026-07-17 Phase 4 continuation checkpoint

- Source/local milestone: backend provision QR is idempotent and audit-atomic; inventory metadata is synchronized through JSON, SQL and importer; Admin Add Device uses a stable key and pending-dismissal guard.
- Verification: backend device-security 31/31 plus check/base/repository/workspace/identity/KLT smokes; Admin contracts 28/28, typecheck, lint/build; firmware three PlatformIO builds and shared fixtures.
- Still blocked/open: real PostgreSQL/provider/browser/Android/hardware proof, native firmware tests without host `gcc/g++`, secure setup AP PoP/CSRF/expiry, two-phase secret rotation, SQL claim lifecycle and complete telemetry ACK/durable dedupe.

### 2026-07-17 Phase 4 secure setup and telemetry checkpoint

- Setup AP source hardening is implemented for factory/physical gating, CSRF, security headers, expiry and factory reset. The remaining setup security gap is per-device PoP/WPA2 plus hardware confirmation.
- Telemetry now has one allowlisted contract from firmware through WSS/backend migration 026 to Web/Admin/Android models. Secret-shaped and unknown fields are rejected; freshness continues to use server-side `lastSeenAt`.
- Evidence recorded: backend 33/33 device-security smoke, Web lint/build, Admin 28/28 + typecheck/lint/build, Android compile/unit test, and firmware build/test-target compile. Native, provider, browser, Android runtime and physical device proof remain blocked.
- Next Phase 4 gate: rotation ACK/overlap, SQL claim lifecycle and durable command dedupe; telemetry UI may expose only confirmed/stale/degraded states.

### 2026-07-19 Phase 6–7 current checkpoint

- Consent/settings/membership, service packages and Platform Storage are now source/local closed; detailed proof is in `SMART_HEALTH_IMPLEMENTATION_STATUS.md` and `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`.
- Current package/storage gates: backend package 3/3, storage 6/6, check/base/repository/identity/workspace/KLT; Admin 91/91 plus TypeScript, ESLint and client/SSR build; OpenAPI 0.3.0 parsed.
- Keep live migrations 037/038, S3 signed sharing, authenticated browser mutation and deploy marked `BLOCKED`. Android and firmware are `N/A` for these Platform Admin-only operations.
- Continue with the smallest remaining Admin operation audit; do not repeat closed Phase 4/5 or UI-foundation work without a reproduced regression.

### 2026-07-19 Phase 6–7 staff invitation checkpoint

- Staff invitation is source/local closed through migration 039, JSON/PostgreSQL repositories, OpenAPI and Admin/Portal/Auth clients. The lifecycle is list/create/resend/revoke/accept with six workspace roles, required idempotency, tenant/RBAC, transaction audit, token-hash-only persistence and truthful provider delivery state.
- Web Auth owns `/staff-invitations/accept`; identity-only login/2FA/signup/email verification does not grant Portal access until exact acceptance and active membership survive an authority refresh. Admin Doctors and Portal Staff retain independent UI/UX.
- Evidence is recorded in `SMART_HEALTH_IMPLEMENTATION_STATUS.md`, `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` and `docs/khoaluan/04-test-matrix-and-gap-log.md`. Live migration/provider/inbox/authenticated production mutation/deploy remain `BLOCKED`.
- Clinics/Workspace lifecycle P0/P1 is source/local closed. Active work moves to Phase 6–7C: the next smallest remaining real operation or fake-state gap, while live migration/provider/deploy proof stays separate.

### 2026-07-23 Phase 6–7 Clinics/Workspace checkpoint

- Migration 040, JSON/PostgreSQL repositories and OpenAPI now share a versioned, idempotent and audited create/edit/transition/archive lifecycle. Owner approval/transfer uses the same canonical state machine and explicit archive tombstones survive restart.
- Admin Clinics/theme and Web Auth/theme remain separate UI implementations. Evidence: backend lifecycle 7/7 plus integrated gates; Admin 122/122 and browser 27/27; Web 44/44 contracts, 94/94 Auth and browser 135/135.
- Live PostgreSQL migration/rollback, provider credentials, preview/live mutation cleanup, deployment and bundled JSON tenant remediation remain open or `BLOCKED`. Platform approval is Web/Admin-only; Android consumes membership/workspace status through native UI and firmware is `N/A`.
- Continue from `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` and `SMART_HEALTH_PRODUCTION_BACKLOG.md`; do not reopen this source slice without concrete regression evidence.

### 2026-07-23 Phase 6–7C Notifications checkpoint

- Migration 041 and JSON/PostgreSQL repositories now provide audited, idempotent, tenant-scoped notification campaigns with truthful per-channel delivery state. OpenAPI parsed with 54 paths and 48 schemas.
- Admin passed 128/128 contracts and the self-starting 36/36 browser matrix with a real local recipient campaign and cleanup. Web passed 94/94 Auth and 44/44 contracts; Android passed 176/176 and debug assemble while retaining native UI.
- Live PostgreSQL/provider/device/preview/deploy proof remains `BLOCKED`; firmware impact is `N/A`. Continue Phase 6–7D from the remaining ledger gaps.

### 2026-07-23 Phase 6–7D1 Overview checkpoint

- Admin/Portal Overview now uses real timestamp buckets for `today|7d|30d`, explicit timezone/range metadata, stable lifecycle keys and strict tenant-scoped totals. It no longer renders fallback zeros, fixed fake chart percentages, hardcoded trends, fake progress or a synthetic recent-alert timeline.
- Evidence passed: backend overview 4/4 plus integrated gates; OpenAPI 56 paths/53 schemas; Admin 135/135, type/lint/build/Firebase build and browser 45/45 with zero blocking accessibility/runtime/layout/theme/target findings.
- No live deploy is implied. Android actor-specific dashboards and firmware are `N/A` for this aggregate desktop read slice. Continue Phase 6–7D2 from the remaining `DATA-FAKE-011` gaps.

### 2026-07-23 Phase 6–7D2A Storage checkpoint

- Admin Storage now settles stats/files independently, strict-validates both read models, preserves partial/stale confirmed results and never renders a dormant aggregate zero fallback. Upload fails closed until the backend bucket catalog is confirmed; Devices uses the same strict file parser for firmware inventory.
- Semantic light/dark chart tokens, reduced motion, accessible chart summaries and 44 px actions are browser-verified. Evidence passed: Storage 13/13, Admin 138/138, type/lint/client+SSR/Firebase builds and browser 54/54 with zero blocking accessibility/runtime/layout/theme/target findings.
- No live deploy is implied. Existing S3/provider proof remains `BLOCKED`; Android and firmware are `N/A`. Continue D2 from the next reproduced gap.

### 2026-07-23 Phase 6–7D2B Patient CRUD checkpoint

- Backend, Platform Admin and Portal now keep canonical `patientId` separate from the human-facing `patientCode`. Create/edit/delete use structured clinical and contact fields, exact receipts, stable retry keys, tenant/capability checks and audited idempotent mutations; JSON-mode writes are serialized with rollback on persistence failure.
- Admin and Portal retain independent responsive UI. Browser proof passed Admin `63` route/viewport/theme checks plus real patient create/update/delete, and Portal Patients `9` viewport/theme checks plus exact replay and cleanup. The browser runs also found and fixed undersized targets and an invalid ARIA status label in the shared Portal shell.
- Regression evidence passed: backend check/base/repository/workspace/KLT gates; Admin `146/146` contracts plus type/lint/client+SSR/Firebase builds; Web `53/53` contracts and `96/96` Auth/UI tests plus type/lint/client+SSR/Firebase builds; Android family-profile unit tests and full debug unit/build gate.
- No live deploy is implied. Android keeps its native Family Profiles UX; emulator/device proof remains open. Firmware is `N/A`. Patient CSV Import is not closed by this slice and is the active D2C work item: `validate → preview → commit`, duplicate handling, expiry, transactionality and idempotency.

### 2026-07-23 Phase 6–7D2C Patient CSV Import checkpoint

- Backend now owns a persisted, tenant-scoped, 24-hour `validate → preview → commit` batch with UTF-8/5 MiB/5,000-row limits, structured patient validation, duplicate reporting, final conflict recheck, required idempotency and transaction-bound audit. Migration 042 and the JSON importer preserve the contract.
- Portal replaces the sequential row-create screen with an independent responsive workflow and complete operational states. Browser proof passed `18` viewport/theme checks plus real validation, atomic commit, replay and cleanup; an action-label contrast regression found by axe was fixed.
- Evidence passed: import `8/8`, full backend gates, OpenAPI `59/59`, Web `57/57` contracts, `97/97` Auth/UI, type/lint/client+SSR/Firebase builds. Live PostgreSQL/migration/deploy proof remains open. Android and firmware are `N/A`; continue D2 from the next reproduced truthfulness gap.

### 2026-07-23 Phase 6–7D2D Audit/Export checkpoint

- `/api/v1/audit-logs` is now the canonical append-only audit ledger with server-side query/filter/sort/pagination. `/api/v1/access-logs` and `/api/v1/portal/audit-log` remain compatibility aliases over the same contract; audit metadata is recursively secret-redacted before persistence and JSON fallback remains append-only.
- Migration 043 and renderer `shcare.export-artifact.v1` produce immutable backend JSON, UTF-8 CSV, OpenXML XLSX and PDF artifacts with persisted dataset/scope/filter metadata and SHA-256. Create/download are audited, create is idempotent and exact replay does not duplicate the audit outcome.
- Export capability and scope are explicit: Platform Admin can create platform-global audit exports; workspace owner/admin is workspace-scoped; doctor clinical data is limited to active patient grants; patient data is limited to owned/dependent profiles; billing and viewer are denied. Job list/download also enforce tenant and creator/manager visibility.
- Backend evidence passed `check:audit-export`, focused audit/export `12/12`, repositories, identity migrations, workspace access, `npm.cmd test`, KLT contract and OpenAPI `0.4.0`. The bundled JSON tenant mismatch and dangling-owner reference now have explicit remediation audit entries and no longer remain the current identity-import blocker.
- Platform Admin passed TypeScript, ESLint, `151/151` contracts, build and browser `72/72` across 390/768/1440 plus light/dark/system. The browser run found zero blocking accessibility/runtime/request/layout/theme/target issue and verified a real platform CSV Blob through SHA-256, response filename, BOM and cleanup. `xlsx` advisories are removed; `npm audit --omit=dev` still reports 17 other advisories (0 critical) for release review.
- Portal passed focused `8/8`, full Vitest `29` files/`105` tests, contracts `60/60`, TypeScript, ESLint, Firebase build and targeted browser proof. The browser filtered 147 audit rows to 11 `q=scan` rows on the server, downloaded the matching 11-row CSV, verified SHA prefix `4e031d2e6faa`, observed the create/download ledger pair and cleaned all local runtime data. Workspace/scope/renderer/hash drift fails closed.
- The full Portal route smoke is not claimed green: after obsolete selectors were repaired, the third rerun ended on dev-server timeout/`ERR_CONNECTION_REFUSED` before a product assertion. Portal `bun audit` reports 5 advisories (1 high, 3 moderate, 1 low); this harness/dependency evidence remains visible rather than being called complete.
- No live migration 043, live database/provider, authenticated preview/live artifact download or deployment is implied. Android workspace/platform audit UI is `N/A`; personal export/access-history is a separate native Settings/Security slice. Firmware is `N/A`.

### 2026-07-29 Phase 2 Public Web UI foundation checkpoint

- Authoritative continuity remains `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md`,
  `docs/SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` and the current diff under
  **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**.
- All `22` Public RouteContract routes pass the canonical local browser matrix
  across five viewports and light/dark/system: `5,325/5,325` checks. Web
  contracts pass `99/99`; Prettier, TypeScript, ESLint and client/SSR build pass.
- Public source/build/local-browser foundation is closed; Auth, remaining
  Platform Admin, independent Android adaptive/runtime, preview/live/provider,
  physical device and firmware-HIL proof remain open or `BLOCKED`.
- After interruption, resume with Auth shell/RouteContract UI-state foundation.
  Do not rebuild Public or an older closure without a reproduced regression.

### 2026-07-29 Phase 2 Auth UI/state foundation checkpoint

- Continuity remains the named master plan, the latest handoff, the execution
  ledger and the current diff. Global status remains **Phase 2 in progress**.
- All `15` Auth RouteContract routes pass the canonical source/build/local
  foundation: focused `5/5`, Auth/UI `211/211`, contracts `104/104`,
  TypeScript/ESLint/build and Chromium `3,615/3,615` over five viewports and
  light/dark/system.
- Dedicated password-reset confirmation now verifies and confirms a Firebase
  action code without exposing it. Anonymous approval and verification-delivery
  copy no longer invent account/provider facts.
- Firebase live link/provider/deploy, Android runtime/manual accessibility,
  physical-device and firmware-HIL proof remain open or `BLOCKED`.
- After interruption, keep Public/Auth and all older rows closed absent a
  reproduced regression. Resume with Platform Admin UI-foundation census, then
  independent Android adaptive/runtime evidence.

### 2026-07-23 Phase 8B/8C release-candidate checkpoint

- Canonical release record:
  `docs/SMART_HEALTH_RELEASE_CANDIDATE_MANIFEST.md`.
- The complete Portal route smoke now passes locally; final Web evidence is
  `105/105` Auth/UI, `63/63` contracts, type/lint/Firebase build and browser
  `ok: true`.
- Fresh Admin, Android, brand/contracts and firmware candidate builds pass.
  The manifest records versions, SHA-256 artifacts, compatibility, explicit
  exclusions and rollback order.
- Portal now has a clean `bun audit` after compatible patched dependency pins
  and a green full gate rerun. Admin production-only audit is one low
  development-server advisory with zero high/critical findings.
- Active phase is intentional candidate commit/tag plus clean-worktree
  verification. PostgreSQL/provider preview/live, Android production
  signing/runtime and physical-board proof remain `BLOCKED`.

## 2026-07-29 Phase 2 Platform Admin UI-foundation checkpoint

- Platform Admin source/build/local-browser foundation is closed: Shcare shell/theme, command palette, offline and operational states, 44 px targets, reduced motion, canonical drawers, truthful Account 2FA/preferences and real direct-route permission proof.
- Final evidence is contracts `169/169`, TypeScript/ESLint/client+SSR build, Chromium `225` visits over fifteen routes × five viewports × three themes, plus critical Firefox/WebKit mobile and desktop journeys. Aggregate browser proof is `241` route, `19` Account cleanup, `19` drawer, `25` state and `5` direct-denial checks.
- Android remains an independently native track. Access Log source/local work is closed; Settings owner/workspace/capability/logout convergence is the current Phase 2 checkpoint. No Web/Admin layout is copied to Compose.
- Preview/live/provider/database, Android runtime/manual TalkBack, physical device and firmware HIL are not implied and remain open or `BLOCKED`.

## 2026-07-29 Phase 2 Android Settings and clinical-status checkpoint

- Settings and the bounded clinical-status contract are closed for source/build/local proof. Backend passes clinical `4/4`, check and workspace access; Web passes contracts `105/105`, type/lint/client+SSR build plus notification-inbox browser `66/66` and Portal UI-foundation browser `1,374/1,374`; Android passes `78` suites and `449/449` tests, both Kotlin compile gates, AndroidTest compile, assemble and lint.
- Android Settings now binds immutable UI state to the exact account/workspace/membership epoch, fails closed on authority changes, bounds stale PII to recoverable failures and clears authority before logout termination. Status endpoints expose health-only public data and exact-workspace authenticated clinical data.
- APK evidence is `23,906,757` bytes with SHA-256 `D1611B9E51D4E7DBC39DFE4106D307C58641688040E8CC94BA90CB9A56456BDD`.
- Firebase build/provider proof is `BLOCKED` by six absent `VITE_FIREBASE_*` variables. Android runtime/FCM/manual TalkBack/golden proof is `BLOCKED` because `google-services.json` and an attached ADB target are absent.
- Continue Phase 2 with Patient Dashboard authority-bound native foundation. Keep full clinical live/stop-scan UI work in Phase 5. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` and untouched.

## 2026-07-29 Phase 2 Patient Dashboard checkpoint

- Patient Dashboard is closed for source/build/local proof under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**; global status remains **Phase 2 in progress**.
- Pure versioned `GET /api/v1/patient/dashboard` reads the canonical active-profile identity persisted only by accepted idempotent active-profile PATCH; owner/account/guardian plus exact-workspace access and strict scan/device isolation align through shared schema/fixture/OpenAPI and Android validation.
- The independent native route uses immutable repository/ViewModel state, exact authority epoch, complete operational states, capability-gated typed actions, truthful presence/battery, adaptive 360/412/600/840 dp behavior and 48 dp/TalkBack semantics.
- Proof: backend Patient Dashboard `7/7`, workspace-access/check/test; contracts `35/35`; Android focused `32/32`, full unit `473/473`, compile/AndroidTest compile/assemble/lint. APK `24,001,564` bytes, SHA-256 `BDD617D4E175892660720BD9944F0A6055B200DDE5A1FFD792BB1DD45ACC22AE`.
- `google-services.json` and an ADB target are absent, so emulator/golden/manual TalkBack/FCM/live-provider/physical-device/hardware proof remains `BLOCKED`. Phase 5 owns remaining `scanIsNormal` debt in Dashboard, Medical Records and Record Detail. Deep Security remains untouched at `running/preflight`.

## 2026-07-29 latest restart index — Patient Dashboard hardening

- Governing plan: **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**.
- Global status: Phase 0–1 complete; **Phase 2 in progress**; Phase 3–8 pending.
- Canonical restart set: `SMART_HEALTH_CONTEXT_NEW_CHAT.md` latest section, `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` latest row, current worktree diff, Android XML results and the current APK hash.
- Superseding proof: backend Patient Dashboard `9/9` plus workspace/check/full/repository smokes; shared contracts `35/35`; Android focused `62/62`, full `487/487`, compile/AndroidTest compile/assemble/lint; APK `24,018,920` bytes, SHA-256 `751A9CDACB18B18D19C8CE88116D24B664451495FDFF2AC68EBD5BD9CF311C20`.
- Closed facts: pure dashboard GET, no pre-acceptance profile bootstrap, exact/legacy-safe idempotency receipts, strict Android DTO types, retry-key retention and subject-epoch back-stack invalidation.
- Resume by inventorying the next genuinely open Phase 2 Android-native foundation row. Do not repeat any closed row without reproducing a regression. Runtime/provider/device evidence remains `BLOCKED`; Deep Security remains untouched at `running/preflight`.

## 2026-07-29 latest restart index — account password workflow closure

- Governing plan remains **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 is in progress**, and Phase 3–8 are pending.
- The cross-surface account password workflow is closed for source/build/local proof. Web Portal, Platform Admin and Android keep independent UI/UX, but share one versioned contract: client reauthentication only, one backend-owned idempotent mutation, exact untrimmed secrets, active account/workspace authority, an exact account-bound receipt, and logout only after that receipt.
- Backend confirmation is operation-aware. A Firebase `auth/user-not-found` race after current-password proof cannot be reported as password-change success; `reset_password` requires `updated: true`, while already-missing remains valid only for delete semantics.
- Fresh proof: backend Firebase/password bundle `22/22`, `check`, full smoke, repositories, workspace-access and KLT contract; shared password contracts `29/29`; Web Auth/UI `227/227` in 52 files, Web contracts `105/105`, lint, client+SSR build and Portal browser `1,374/1,374`; Admin contracts `175/175`, lint, client+SSR build and targeted dark desktop `/account` browser acceptance; Android `86` suites / `518/518`, both Kotlin compile gates, AndroidTest compile, assemble and lint.
- Debug APK is `24,066,508` bytes, SHA-256 `5DC07A7E02A0F97FB62C80FBD1201EDBE5E3E2174F71F335FBCA053917DE9FD0`.
- Restart authority is the latest `SMART_HEALTH_CONTEXT_NEW_CHAT.md` section, latest execution-ledger row, current diff and generated proof. Keep this and every earlier closure closed unless a current regression is reproduced. Inventory the seven explicitly tracked legacy direct-API Android screens before choosing the next bounded Phase 2 native row.
- Live Firebase/PostgreSQL/provider proof, full Admin browser-matrix rerun, Android emulator/device/manual TalkBack/Remove Animations, production signing, physical device and firmware HIL remain open or `BLOCKED`. Deep Security remains separately untouched at `running/preflight`.

## 2026-08-01 latest restart index — registration and role-request closure

- Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**.
- First restart pointer: **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Global status: Phase 0–1 complete; **Phase 2 in progress**; Phase 3–8 pending. Registration/email verification/role request is closed for source/build/local proof and must not be repeated without a current reproduced regression.
- Proof summary: Web `288/288` plus contracts/type/lint/build; backend role-document `13/13`, shared `38/38`, check/base/workspace/repositories; Android `579/579`, both compile gates, assemble/lint; APK SHA-256 `C0230EB545E4BFA34D9EE68857CC0FE9C6C1C2217783F3874557F08E338FE7E6`. Independent final reviews found no remaining P0/P1 in the changed scope.
- Provider/runtime/device evidence remains open or `BLOCKED`. Resume from the active checkpoint, newest context/ledger, current diff and generated proof. The next row is Android Doctor Approval architecture-bound native foundation; SignUp follows, while clinical/audio screens remain Phase 5.

## 2026-08-02 latest restart index — Doctor Approval closure

- Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. First restart pointer: **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Global status: Phase 0–1 complete; **Phase 2 in progress**; Phase 3–8 pending. Doctor Approval and role-target authority are closed for source/build/local proof and are not to be repeated without a current reproduced regression.
- Android proof: `95` suites / `611/611`, AndroidTest Kotlin compile, assemble/lint; APK `25,552,231` bytes, SHA-256 `84D99052B50E91282589F81DF94BDCC8BFF606CD410BC6E4CC84132364B216FA`. Shared contracts are `31/31`; backend check/test/workspace/repository gates pass. Independent reviews found no bounded P0/P1.
- Runtime/provider/device evidence remains open or `BLOCKED`. P2 debt remains for a dedicated doctor-target field and atomic approval persistence.
- Resume from SignUp in the active checkpoint. Web/Admin and Android UI/UX remain independent; Dashboard/Live/Records/New Scan remain Phase 5; Deep Security stays separate at `running/preflight`.

## 2026-08-02 latest restart index — Android auth/session owner closure

- Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Con trỏ đầu tiên khi restart: **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Trạng thái toàn cục: Phase 0–1 đã hoàn tất; **Phase 2 vẫn đang thực hiện**; Phase 3–8 còn pending. Các đường auth/session đã sửa qua Splash/Login/SignUp/Verify/Doctor đóng ở mức source/build/local; không mở lại nếu chưa tái hiện regression.
- Chốt chức năng: exact `FirebaseOwnerBinding`, năm P1 owner/termination/reauthorization/workspace-profile đã sửa, confirmation dùng đúng snapshot `MobileSessionAuthority`, same-identity/new-epoch bị từ chối và `AppNav` không còn global clear/terminate.
- Bằng chứng: review độc lập P0/P1/P2 đều không còn trong các đường đã sửa; Android `98` suites / `655` tests, failures/errors/skipped `0`; build `4m43s` / `56` tasks; lint `43` warnings / `0` errors và `0` auth/session issue trong phạm vi; APK `24,172,920` bytes, SHA-256 `CEB6BFC23995B361AD0BD23B24F4F836E0464BCB215105C8A6EDE8BACDAC5F69`; diff check sạch.
- P2 SignUp abandonment/back còn mở. Firebase/provider/navigation runtime vẫn `BLOCKED` vì thiếu `google-services.json` và ADB target.
- Resume bằng kiểm toán hoàn tất Phase 2 foundation trên Web foundation và Android native foundation. Dashboard, Live, Medical Records, New Scan và audio vẫn thuộc Phase 5.

## 2026-08-02 latest restart index — Web CSS A và Android adaptive foundation

- Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. Restart đầu tiên tại **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Phase map: Phase 0–1 complete; **Phase 2 in progress**; Phase 3–8 pending.
- Web evidence: retired selector consumers `0`, Portal opaque/no-blur and mobile-visible semantic `h1`; CSS debt `1,909 → 1,839`; contracts `112/112`, TypeScript/build/lint, Chromium Portal `1,374` checks and Public `5,325` checks pass.
- Android evidence: typed compact/rail/two-pane shell, reusable Clinical Patients list/detail; `99` suites / `660/660`, AndroidTest compile, assemble/lint; APK SHA-256 `AF2E8648AF12B2F360B1AE2FA7DEC59386C52872185D4605001BC353F800F66B`.
- Resume only remaining Phase 2 gaps: CSS consolidation plus Firefox/WebKit/visual/performance proof and Android resources/deep-link/testTag/large-font visual proof. Runtime/provider/device remains open or `BLOCKED`; Phase 5 clinical/audio scope is not pulled forward.

## 2026-08-15 latest restart index — Phase 5 active

- Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. First restart pointer: **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Current phase map: Phase 0–4 complete at software/source/build/local gates; **Phase 5 in progress**; Phase 6–8 pending. Overall plan remains NOT PASS.
- Phase 4 exit: OTA/repository `24/24`, private HTTP `8/8`, ownership/storage `67/67`, backend check; Android `109` suites / `793` tests plus build/lint and APK hash `DCEEEC05251FAE3AD475F5C1F4B41CA6D43E9728AC68C961553E57F9BAF47B34`; firmware source/production/OTA builds PASS.
- Hardware HIL is `DEFERRED — chờ phần cứng`; Firebase/ADB/provider/native-gcc evidence remains separately `BLOCKED`. Do not reopen closed Phase 4 source rows solely because this evidence is unavailable.
- Resume Phase 5 from canonical audio v2 plus scan stop/failure/idempotency/restart convergence and Android live/record repository/ViewModel boundaries. Five active RED backend tests must become GREEN before Phase 5 closure. Deep Security remains separate at `running/preflight`.

## 2026-08-22 latest restart index — Phase 6 active

- Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. First restart pointer: **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Current phase map: Phase 0–5 complete at software/source/build/local; **Phase 6 in progress**; Phase 7–8 pending. Overall plan remains NOT PASS.
- Latest proof: backend `82/82 + 8/8 + 4/4 + 4/4 + 6/6`; Web `28/28 + 12/12` plus direct TypeScript/lint/build; Android `116/830` plus AndroidTest compile/assemble/lint and APK SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`; firmware audio-v2 SHA-256 `CC53E0084BB699BC4787FC10DD20E1AFEC3454E46A05286DE61B56671F357EF6`.
- Resume Phase 6 at appointment, consent, alert and notification impact inventory. Runtime/provider/HIL limitations remain separate and do not reopen closed software rows.

## 2026-08-22 latest restart index — Phase 7 active

- Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. First restart pointer: **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Current phase map: Phase 0–6 complete at software/source/build/local; **Phase 7 in progress**; Phase 8 pending. Overall plan remains NOT PASS.
- Phase 6 closure proof: shared contracts `49/49`; backend appointment/consent/alert/notification gates; Web contract/component/type/lint/build; Admin `183/183` plus lint/build; Android `116/830` plus build/lint and APK SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`.
- Resume Phase 7 at remaining Admin operations and remove fake/local-only behavior. Runtime provider/ADB and physical HIL remain separately blocked/deferred and do not reopen closed software rows.

## 2026-08-22 latest restart index — Phase 8 active

- Master plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**. First restart pointer: **[Shcare Active Restart Checkpoint](SMART_HEALTH_ACTIVE_CHECKPOINT.md)**.
- Current phase map: Phase 0–7 complete at software/source/build/local; **Phase 8 in progress**. Overall plan remains NOT PASS until the RC/demo and all required non-deferred gates close.
- Phase 7 closure proof: shared `50/50`; backend check/admin-list `3/3`/workspace/repositories; Admin `185/185` plus lint and build. Five Admin list surfaces now use backend query/pagination and truthful aggregate metadata.
- Resume Phase 8 at the intentional candidate inventory, local demo artifacts, hashes, compatibility, deploy/rollback record and handoff. External provider/ADB/HIL evidence remains explicitly blocked/deferred.

## 2026-08-22 RC2 demo/candidate index

- Governing plan: [SHCARE_REBUILD_MASTER_PLAN.md](SHCARE_REBUILD_MASTER_PLAN.md).
- Restart state: [SMART_HEALTH_ACTIVE_CHECKPOINT.md](SMART_HEALTH_ACTIVE_CHECKPOINT.md).
- RC2 versions, hashes, gate verdicts and rollback: [SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md](SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md).
- Demo operator checklist: [khoaluan/03-demo-and-evidence-checklist.md](khoaluan/03-demo-and-evidence-checklist.md).
- Phase 0–7 are closed at source/build/local scope; Phase 8 is active. Local demo is ready, while live/provider/Android-runtime gates remain blocked and hardware HIL remains deferred.

## 2026-08-25 latest restart index — G3 BLE-first pairing active

- Governing plan: [Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md). Restart pointer: [SMART_HEALTH_ACTIVE_CHECKPOINT.md](SMART_HEALTH_ACTIVE_CHECKPOINT.md).
- Phase map: G0–G2 complete; **G3 active**; G4 pending. This correction does not reopen completed work.
- Source: Android `devices/DeviceBleProvisioningContract.kt`, `devices/DeviceBleProvisioner.kt`, `devices/DevicePairingViewModel.kt`, `ui/screens/DevicePairingScreen.kt`; firmware `MSM261S4030H0/src/main.cpp`.
- Latest evidence: Android `119/857`, lint/assemble; firmware development/production build. COM9 reports BLE ready/offline and both microphones; App authenticated HIL and host BLE scan remain blocked. See active checkpoint before release claims.
