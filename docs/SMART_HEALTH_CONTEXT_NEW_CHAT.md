# Smart Health - New Chat Context

Last updated: 2026-08-27

## 2026-08-27 G3 hardware re-probe — board visible and production image reflashed

- Restored missing workspace dependencies with lockfile installs for backend and Web Admin. Backend full local gate, Web Admin contracts/typecheck/lint/build, Shcare Web contracts/auth/lint/build, Android unit/compile and firmware builds pass.
- Host now detects Xiaomi over ADB and the ESP32-S3 on `COM9`. Production firmware `esp32-s3-devkitm-1` was reflashed successfully; esptool verified the image hash on-device. Serial telemetry shows active waveform/envelope/RMS/peak metrics from the firmware.
- Native firmware tests remain `BLOCKED` because this Windows host has no `gcc/g++`. Android physical provisioning remains open because the phone is locked and MIUI blocks shell input injection; no Wi-Fi password was sent through ADB or logs. G4 remains pending until G3 association/WSS/ACK/audio/scan/OTA rollback evidence is captured.

## 2026-08-26 authoritative Android ESPTouch V2 update — supersedes earlier SoftAP notes

- The canonical provisioning flow is `Device ID -> backend-authorized setup session -> ESPTouch V2 AES-128 broadcast -> ESP32-S3 joins the target router -> authenticated WSS presence -> Online`. BLE, ESP setup AP, local HTTP `192.168.4.1`, browser/IP entry, and a manual Wi-Fi Settings handoff are not part of the Android production path.
- A real Xiaomi scan confirmed that the active router publishes the same SSID on both 5 GHz and a separate 2.4 GHz BSSID (2442 MHz). `AndroidDeviceWifiProvisioner` now selects the strongest exact 2.4 GHz BSSID for that same SSID with `WifiNetworkSpecifier`, binds the process only during the ESPTouch broadcast, then releases the network request. The user does not select an ESP network.
- The merged APK manifest has no Bluetooth or nearby-device permission. The app requests only coarse/fine location at the point it needs SSID/BSSID scan data; Android may show its one-time system consent dialog. It must not send the user to Settings unless Android reports a permanent denial.
- Proof completed: focused Android unit/source-contract tests (37 tests), `:app:lintDebug`, `:app:assembleLocalDemoDebug`, and Xiaomi APK install all passed. Installed APK SHA-256: `30002978605139CA73B8618479DE72CBF2DFBC32E8DF7A9228A83A8EB3696C5D`.
- HIL remains open: the real target password must be entered only in the secure foreground app field and the user may need to approve Android's normal network confirmation. Association/DHCP, authenticated WSS, command ACK, audio-v2, durable scan, signed OTA and rollback are not yet claimed as passed. G3 remains active; G4 must not start.

This is the first file a new Codex chat should read before working on Smart Health. Its purpose is to reduce quota/token usage by summarizing the project state, decisions, paths, tools, and next work so the assistant does not re-scan the entire codebase from scratch.

## 2026-08-26 Device Wi-Fi flow clarification and HIL constraint

- Android provisioning is the native path `App -> ESP Wi-Fi -> HTTP 192.168.4.1 -> target Wi-Fi -> online confirmation`; it does not use BLE, a browser, or a user-entered IP address. The app makes the local HTTP calls itself.
- User-facing Android copy now calls the flow “Kết nối với ESP”, “Mở API nội bộ”, “Gửi Wi-Fi”, “Chờ ESP vào Wi-Fi”, and “Xác nhận ESP trực tuyến”. It no longer exposes confusing “Wi-Fi tạm thời”, SoftAP, or WSS terminology.
- Android `:app:compileDebugKotlin :app:testDebugUnitTest` passed after the copy change. XML parsing and a string sweep passed.
- The attempted full physical HIL is not a product failure: wireless ADB is disconnected when Android changes the Wi-Fi radio to the ESP, so Gradle reports `device not found`. A full app-driven provisioning HIL needs a stable USB ADB transport (or equivalent independent device telemetry); it must remain `BLOCKED` until that evidence exists. At the last probe neither the Xiaomi ADB device nor ESP COM9 was visible to the host.

## 2026-08-26 G3 update â€” supersedes the preceding same-date HIL note

- Device ID is a backend authorization/ownership proof, not a radio link to an offline ESP. The canonical route stays `App -> secured ESP AP -> local HTTP -> target Wi-Fi -> authenticated WSS`; no BLE, browser or user-entered IP is part of the Android flow.
- Backend setup-session now sends signed `wifi.setup.open` only to the authenticated target device, with an empty payload. Firmware journals the command before opening its secured setup AP, and opens the same recovery AP after three saved-network reconnect failures. Wi-Fi credentials never enter the backend command or WSS payload.
- Android waits for AP startup, then requests the system-owned Wi-Fi connection and calls the ESP API itself. Its trace has no BLE, browser, IP or temporary-network wording; Android may still show the mandatory network-consent dialog.
- Evidence: backend `smoke:device-security` passed `83/83`; the ESP32-S3 production image built and flashed to real `COM9` with SHA-256 `4B4822D2C88C99100556281DCA45E12FAB9212EC428ACC84D84A02DBB250EE51`; serial proves two active I2S slots and Windows scan sees `Shcare-9789739A9DB9`. Android unit tests, local-LAN APK build/install and Xiaomi Compose HIL through Device Management -> Kết nối Wi-Fi -> secure password boundary passed.
- Xiaomi is visible over wireless ADB, but MIUI rejects shell input injection. The target Wi-Fi password remains input only in the foreground App field; ESP association, authenticated WSS, ACK, audio-v2, durable scan and OTA rollback are still `BLOCKED`. Do not start G4 or claim physical end-to-end PASS.

## Mandatory Context Maintenance Rule

After every meaningful code or configuration change in the Smart Health project, update these project context files before finishing the turn:

- `D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md` when commands, ports, env vars, verification steps, or runbooks change

Update only the sections affected by the change. Keep the files concise, factual, and current. The goal is to make future new chats cheap: read the context docs first, then inspect only the few relevant source files.

Fast project navigation now starts at `D:\Study\KLTN\docs\SMART_HEALTH_PROJECT_INDEX.md`. Use it to locate the active source folders, live URLs, handoff files, cleanup rules, and focused smoke commands without scanning the whole workspace.

## Whole-System Scope Rule

Smart Health is the full `D:\Study\KLTN` product workspace: `smart-health-embedded` backend/firmware, `smart-health-android`, `smart-health-admin`, `smart-health-web`, Firebase Auth/Hosting, Render, Supabase/Postgres/storage, CI/deploy tooling, smoke scripts, and handoff docs. Future work must develop and verify the connected workflow across the affected surfaces instead of treating one folder as the whole project.

When a change touches product behavior, check the cross-surface contract: backend authorization/repository logic, client API usage, role/surface routing, tenant isolation, storage/notification/device side effects, Android/web/admin UX, firmware/device protocol if applicable, verification commands, deployment state, and handoff updates.

## Current User Priority - KLTN Gate Before More Product Development

2026-07-10 KLTN source of truth: read `docs/SMART_HEALTH_KLTN_REPORT_COMPLETION_PLAN.md` and `docs/khoaluan/README.md` before selecting new development slices. `docs/khoaluan` now contains the unified thesis system contract, audio packet/WebSocket contract, demo evidence checklist, and test/gap matrix. Backend `npm.cmd run smoke:klt-contract` verifies the docs exist and the firmware/backend/Android source still matches the documented PCM16 live-audio contract.

If the user says to focus the main khóa luận work and leave product-development goals for later, read `docs/SMART_HEALTH_KLTN_REPORT_COMPLETION_PLAN.md` before selecting new development slices. The KLTN gate requires report-ready evidence for firmware, backend/runtime, Android, web/admin, audio artifact/waveform, and an honest end-to-end demo narrative, while avoiding overclaims about clinical validation, certification, production-secure UDP, JSON persistence, chatbot medical advice, or device quota semantics.

## 2026-07-10 - KLTN unified contract pack and source smoke

- Added `docs/khoaluan` as the thesis contract pack. It contains `01-system-contract.md`, `02-audio-packet-and-realtime-contract.md`, `03-demo-and-evidence-checklist.md`, and `04-test-matrix-and-gap-log.md`.
- The pack consolidates the common Smart Health entity/status/data ownership contract, ESP32-S3/MSM261S4030H0 PCM16 audio format, backend WebSocket/UDP events, Android live-audio expectations, demo evidence checklist, and KLTN gap matrix.
- Added backend `npm.cmd run smoke:klt-contract` through `smart-health-embedded/web-monitor/scripts/kltContractSmokeTest.js`. It verifies the docs exist and checks the firmware/backend/Android source for the documented 16 kHz mono PCM16, UDP 3001 fallback, `/esp`/`/device`/`/app`/`/listen`, status/metrics events, WAV stop path, and Android binary PCM/status/metrics handling.
- Verification passed: `npm.cmd run smoke:klt-contract`, `node --check scripts\kltContractSmokeTest.js`, backend `npm.cmd run check`, MSM261 PlatformIO build for `esp32-s3-devkitm-1` and `esp32-s3-ota`, and Android `.\gradlew.bat :app:compileDebugKotlin`.
- This closes the missing KLTN contract-documentation/source-contract gap. It does not close the physical ESP32-S3/MSM261S4030H0 serial/audio proof or Android real device/emulator runtime proof; those still require attached hardware/device access.

## 2026-07-10 - Account profile persistence hotfix, live verification blocked

- User reported that editing account information in Shcare Portal showed a success toast, but leaving and re-entering the page restored old values. Targeted live canary reproduced the real issue before the fix: `/api/me` PATCH echoed changed profile fields, but the next authenticated `/me` read rehydrated the old PostgreSQL row.
- Root causes fixed in `smart-health-embedded\web-monitor`: the `/api/me` patch path could overwrite `department` with `specialty`, and it returned runtime profile state without proving repository/Postgres persistence. Commit `c9181740` preserves department/specialty separately and expands profile mutation smokes. Commit `bf0d08cd` adds `users.updateAccountProfile()` with direct SQL `UPDATE users ... RETURNING *` plus `firebase_claims.profile` merge for title, specialty, notification preferences, avatar/2FA metadata, and `/api/me` now fails instead of returning a fake success if no persisted row is returned.
- Smoke coverage was tightened: backend workspace/repository smokes assert account name/phone/title/license/hospital/department/address/notification preferences survive read-after-write, and Shcare Web `portalMutationSmokeTest.mjs` now verifies account profile persistence across save, refresh/reopen, logout/login, and cleanup restore.
- Local verification passed: backend syntax checks for `server.js`, `src\repositories.js`, and both touched smoke scripts; backend `npm.cmd run smoke:repositories`, `npm.cmd run smoke:workspace-access`, `npm.cmd run check`, and `npm.cmd test`; Shcare Web `node --check scripts\portalMutationSmokeTest.mjs`, `bun run lint`, `bunx tsc --noEmit --pretty false`, `bun run build`, and `bun run build:firebase`.
- Supabase project `mahvymyncxszvuhlycwp` was inspected for the smoke account and users role constraint. A direct SQL update probe confirmed the new account-profile write shape works, then the smoke account was restored to baseline values.
- Production caveat: both commits are pushed to `origin/main`, but live verification is blocked because `https://smart-health-api-r5is.onrender.com/api/health` currently returns Render HTML `503 Service Suspended`. Do not mark this slice production-verified until the Render service is unsuspended/restarted and `smoke:public-deployment` plus `smoke:portal-mutation` pass again.

## 2026-07-10 - Shcare Portal billing source follow-up, live verification blocked

- Continued the broad Smart Health prompt after the account-profile fix and found a real gap in `/portal/billing`: the route existed but only read `packageId`, `subscriptionStatus`, and `billingCycle` from the authenticated session. It had no dedicated portal API, no role-specific billing smoke, no billing usage contract, and no Postgres persistence for workspace billing metadata.
- Backend now exposes `GET /api/portal/billing` for portal users with `billing.view`. The payload includes workspace summary, service package, subscription source/status/cycle, current charge, billing contact, invoice policy, quota, usage, and normalized usage rows. Workspace admin and billing role can read it; viewer is denied. Billing usage now counts storage `byteSize` and AI results linked by `scanId`, not only rows that already carry `organizationId`.
- Repository/schema follow-up added migration `011_workspace_billing_metadata.sql` and expanded `organizations` SQL hydrate/upsert for `workspaceType`, address/contact/legal fields, owner, `packageId`, `subscriptionStatus`, `billingCycle`, and `requestMetadata`. Admin workspace package assignment now calls `repositories.organizations.upsert()` so package changes are not JSON/runtime-only in Postgres-backed deployments.
- Shcare Web now calls `smartHealthApi.portalBilling()` from `BillingSummaryPage`, renders loading/error/retry states, plan/current charge/subscription source, usage-limit bars, billing contact, and support CTA. `PortalLayout` includes a billing menu entry for clinic/workspace admins, focused billing/technician/viewer navigation and labels, and route-level capability guards so direct URLs such as `/portal/billing`, `/portal/devices`, `/portal/patients`, and `/portal/audit` redirect to permission denied before rendering pages the user cannot access. `OnboardingChecklist` is now capability-aware so billing/viewer roles do not trigger patient/device API calls they are not allowed to read.
- Smoke coverage was tightened: backend `workspaceAccessSmokeTest.js` asserts portal billing payload and billing/viewer permissions; `repositoriesSmokeTest.js` asserts organization billing metadata SQL hydrate/upsert parity; `portalBrowserSmokeTest.mjs` watches `/api/portal/billing` and asserts the billing page plan/usage/contact sections.
- Local verification passed: backend `npm.cmd run check`, `npm.cmd run smoke:repositories`, `npm.cmd run smoke:workspace-access`; Shcare Web `npm.cmd run lint`, `npm.cmd run build`. Live production verification is still blocked because `npm.cmd run smoke:public-deployment` receives non-JSON Render HTML from the active backend and `npm.cmd run smoke:portal-browser` times out during login navigation.

## 2026-07-10 - Global skill refresh and Matt Pocock full set

- Ran `npx -y skills@latest update -g -y`; the CLI reported all global skills up to date, while warning that many old `K-Dense-AI/scientific-agent-skills` entries and `code-reviewer` appear deleted upstream and were not removed in non-interactive mode.
- Refreshed the full latest `mattpocock/skills` set with `npx -y skills@latest add mattpocock/skills -g --all --copy`. `setup-matt-pocock-skills`, `wayfinder`, `to-spec`, `to-tickets`, `code-review`, `research`, `wizard`, and `loop-me` are now present under `C:\Users\baobe\.agents\skills`.
- Follow-up source refresh found 20 `.agents` skill folders that were not represented in `.agents\.skill-lock.json`. Reinstalled 17 from official GitHub sources with `--agent codex`: `pbakaus/impeccable`, `leonxlnx/taste-skill`, `Panniantong/Agent-Reach`, `affaan-m/ECC`, `upstash/context7`, and `Imbad0202/academic-research-skills-codex`. The lock now tracks 195 of 198 `.agents` skill folders.
- Remaining untracked skill folders are `decision-mapping`, `to-prd`, and `to-issues`; latest `mattpocock/skills` no longer exposes those through CLI discovery, so route to `wayfinder`, `to-spec`, and `to-tickets` first.
- Added `docs/SMART_HEALTH_RULES_AND_SKILLS_AUDIT_2026-07-10.md` as the persistent A-M audit artifact for the user's global/project rules prompt. It records upgraded global rules, Smart Health project rules, skill usage rules, flexible strategy rules, completion checklist, anti-fake-completion rules, retained/changed/merged rules, old gaps, underused skills, and how the new rules force future skill selection.
- Updated `C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md` and `SMART_HEALTH_AGENT_SKILLS_GUIDE.md` so future Smart Health chats route through Matt flow skills when appropriate instead of ignoring them. Smart Health domain work still starts with `smart-health-project`.
- Full metadata audit covered 384 `SKILL.md` files across `.agents`, `.codex`, and plugin cache: zero missing `name`/`description`, 25 duplicate names. Most duplicates are plugin-cache current/remote copies. Routing-sensitive duplicates are documented in the global registry: `qa` prefers Codex `gstack-qa` for Smart Health QA, `pdf` prefers primary-runtime `pdf:pdf`, and `gstack-upgrade` prefers the top-level Codex entry.

## 2026-07-10 - Shcare Web full UI/UX polish deployed/live closure

- User requested a full UI/UX pass for the main web surface, not a few isolated pages. Scope handled here is `smart-health-web` public, auth, and workspace portal routes/components. This does not modify the separate Web Admin or Android apps.
- Source inventory covered `routes.tsx`, public/auth/portal layouts, shared UI primitives, portal state/badge components, and 63 route URLs spanning public marketing/product/legal/help pages, login/register/recovery/approval pages, and protected portal entry paths.
- Added `smart-health-web/src/web-styles/clinical-polish.css` and imported it after `theme.css`, `clinical-system.css`, and `signal-horizon.css` so it is the final UI normalization layer. It standardizes clinical tokens, typography, spacing, cards, forms, buttons, tables, popovers/dialog shells, status colors, and responsive behavior across public/auth/portal without deleting older page styles.
- `StatusBadge.tsx` now maps existing status labels to semantic CSS-variable tones instead of hardcoded neon colors. `PortalState.tsx` now exposes consistent loading/error/empty state classes plus status/alert semantics. `PortalLayout.tsx` now keeps portal popover backdrop blur stable, and `portalBrowserSmokeTest.mjs` checks both standard and browser-supported computed blur fields.
- Local rendered QA passed: custom Playwright sweep checked 63 route URLs at 1440x920 and 390x844 (`126` renders) with `overflowCount=0`, `consoleErrorCount=0`, `badTextCount=0`.
- Authenticated portal smoke passed after starting local Vite through `scripts/production-env.js` so Firebase Web envs are present. `bun run smoke:portal-browser` against local `http://127.0.0.1:8081` and backend `https://smart-health-api-r5is.onrender.com/api` passed Firebase auth, watched portal API 200s, avatar/notification popovers, appointments controls, consent controls, settings controls, workspace switcher, billing/review/claim/assign routes, and audit navigation.
- Verification also passed: Shcare Web `bunx tsc --noEmit --pretty false`, `bun run lint`, `bun run build`, and `bun run build:firebase`. `build:firebase` validated production env for `https://smart-health-api-r5is.onrender.com/api`, `https://shcare.web.app`, and Firebase project `smart-health-stethoscope`.
- Deployed to Firebase Hosting target `webapp` for site `shcare`: version `projects/162993928259/sites/shcare/versions/ce8149834356fa86`, release `projects/162993928259/sites/shcare/channels/live/releases/1783667033816000`. Live HTML now serves `index-PQOT0AAG.css` and `index-CuomDxzU.js`.
- Live verification passed after deploy: `https://shcare.web.app/`, `/login`, and `/portal` returned HTTP 200 with the new assets; backend `https://smart-health-api-r5is.onrender.com/api/health` and `/api/v1/health` returned HTTP 200; live `bun run smoke:portal-browser` passed; live route sweep checked 63 URLs across desktop/mobile (`checkedRoutes=126`, `hardIssueCount=0`, `eventIssueCount=0`).

## 2026-07-09 - Web Admin AI/doctor approval scan lifecycle source follow-up

- Continued the in-progress Web Admin operations slice instead of starting a new unrelated surface. Web Admin `AIMeasurements` now searches backend scan data and calls the real backend AI reprocess action; `DoctorApproval` now uses backend doctor requests plus clinic catalog data instead of static rows; `adminMutationSmokeTest.mjs` now covers admin accounts, doctors, Doctor Approval, and AI Measurements route/action contracts.
- Backend `web-monitor` now has scan reprocess/delete lifecycle support with artifact cleanup, repository-backed scan delete, audit events, and workspace smoke coverage for create -> audio chunk upload -> complete -> reprocess -> delete.
- Security follow-up from the new smoke: selected-scan-only doctor grants can no longer manage a sibling scan through broad patient access. `canManageScan` now uses scan-level access, and doctor/admin scan creation for an existing patient rejects selected-scan-only grants before creating a new sibling scan.
- Verification passed locally: backend `node --check .\server.js`, backend `node --check .\scripts\workspaceAccessSmokeTest.js`, backend `npm.cmd run smoke:workspace-access`, backend `npm.cmd run check`, backend `npm.cmd run smoke:repositories`, Web Admin `node --check .\scripts\adminMutationSmokeTest.mjs`, Web Admin `npm.cmd run lint`, and Web Admin `npm.cmd run build:firebase:admin`.
- Initial source slice was not deployed at that moment; see the 2026-07-10 live closure below for the completed Render/Firebase deploy and expanded live smoke pass.

## 2026-07-10 - Web Admin expanded mutation smoke live closure

- The source-only warning above is now resolved. Commits pushed to `origin/main`: `f79d6cba` wired admin scan lifecycle operations, `56f3c3f8` fixed approved-doctor repository list parity, `6e9a14b3` fixed approved doctor-request repository list parity, and `31fe2ebf` allowed platform admins to access `/ai-measurements`.
- Root causes found by live smoke: repository-backed `listApprovedDoctors()` and `listDoctorRequests()` returned SQL-only rows when SQL had any rows, hiding newly-created runtime/API doctors from Web Admin route assertions; Web Admin route guard exposed platform scan capabilities in Overview but did not include a Platform Admin menu/access rule for `/ai-measurements`.
- Fixes: repository list APIs now merge SQL rows with runtime rows before sorting; `smoke:repositories` covers runtime approved doctors in both approved-doctor and approved-request lists; `adminMutationSmokeTest.mjs` now labels route assertion failures and captures API/DOM summaries for doctors/Doctor Approval; Web Admin platform navigation includes `Lượt đo & AI` with `platform.scans.view/manage`.
- Deploys verified: Render auto-deployed the backend behavior by live canary; Web Admin Firebase Hosting `shcare-admin` is live at version `projects/162993928259/sites/shcare-admin/versions/c6371f255aa5f85f`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783635730840000`.
- Final live smoke passed: `npm.cmd run smoke:admin-mutation` run `admin-mutation-mre2pt6i` against `https://shcare-admin.web.app` and `https://smart-health-api-r5is.onrender.com/api` mutated workspace, package, admin account, patient, device, doctor, scan/audio/reprocess, notification, storage bucket, and settings; checked overview, account, devices, patients, doctors, doctor approval, AI measurements, clinics, packages, notifications, storage, settings, admin accounts, and audit log; cleanup returned HTTP 200 for all 10 targets.

## 2026-07-10 - Backend audio worker queue persistence source follow-up

- Closed a source gap in the scan/AI processing queue: `scripts/worker.js` no longer only runs `processAudioFile()` and logs the result. It now builds a data-store/repository/storage context and calls `src/audioProcessingWorker.js`, which stores audio artifacts, waveform JSON, AI result rows, and completed scan status through the same JSON/Postgres-aware repository path used by the backend.
- Backend scan completion/reprocess no longer processes inline and then enqueues a duplicate Redis job. When `REDIS_URL` queueing succeeds, the scan stays `queued` for the worker; when Redis is absent or enqueue fails, the existing inline fallback remains active.
- Regression coverage was added to backend `npm test`: it creates a tiny WAV file, runs `processAudioJob()`, and asserts scan/audio/AI artifacts are persisted through fake repositories. `npm.cmd run check` now syntax-checks `src/audioProcessingWorker.js`.
- Verification passed locally: backend `npm.cmd test`, `npm.cmd run check`, `npm.cmd run smoke:workspace-access`, and `node scripts\worker.js` with no `REDIS_URL` returning the expected disabled message.
- This is source/build smoke only. A real Redis/BullMQ deployment smoke still needs `REDIS_URL` and the backend/worker running against the same production data/storage env.

## 2026-07-10 - Shcare Portal appointments deployed follow-up

- Closed a missing software module before ESP32 work: appointment/consultation scheduling had only notification preferences and no active API/UI/persistence route.
- Backend now has `appointments` runtime state normalization, appointment capabilities, scoped `/api/v1/appointments`, `/api/portal/appointments`, and `/api/doctor/appointments` routes for list/create/get/update/delete, patient/doctor validation, status transitions, audit events, and scoped in-app notifications.
- Repository/schema follow-up added `repositories.appointments` with JSON fallback plus SQL list/find/save/delete and migration `010_appointments.sql` for the normalized `appointments` table and indexes.
- Shcare Portal now has `/portal/appointments`, sidebar entries for doctor/clinic portals, typed API client methods, a scheduling page with status/search filters, create form, confirm/cancel/delete actions, and browser-smoke selectors.
- Smoke coverage now asserts backend workspace scoping, cross-workspace denial, appointment create/confirm/delete, notification side effect, and browser route/form controls. `smoke:portal-browser`, `smoke:portal-mutation`, and `smoke:performance` include the appointment route/API in their watched coverage.
- Verification passed locally: backend RED first failed on missing `/api/portal/appointments` 404, then backend `npm.cmd run smoke:workspace-access`, `npm.cmd test`, `npm.cmd run check`, `npm.cmd run smoke:repositories`, Shcare Web `npm.cmd run lint`, `.\node_modules\.bin\tsc.exe --noEmit`, `npm.cmd run build`, `npm.cmd run build:firebase`, and `node --check scripts/portalMutationSmokeTest.mjs`. Local Vite dev server returned 200 at `http://127.0.0.1:8080/portal/appointments`.
- Production closure: Supabase migration `20260710054623 appointments` was applied through the Supabase connector to project `mahvymyncxszvuhlycwp` and verified for `public.appointments` columns, indexes, and constraints. Commit `b9a6d4cb` was pushed to `origin/main`; Firebase Hosting `shcare` deployed version `projects/162993928259/sites/shcare/versions/044ec7e04023ffb8`, release `projects/162993928259/sites/shcare/channels/live/releases/1783662693801000`.
- Live verification passed: backend `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`; Shcare Web live `npm.cmd run smoke:portal-browser` saw `/api/portal/appointments` HTTP 200 and route/form controls; live `npm.cmd run smoke:portal-mutation` run `portal-mutation-mreisktg` created appointment `appt_20260710055434_71922d95`, listed it, confirmed it, deleted it, and cleaned up the temporary patient/device/share/settings/support side effects.

## 2026-07-09 - Web Admin production backend guard and live redeploy

- Found a Web Admin config drift after the active backend moved to Render `smart-health-api-r5is`: `smart-health-admin\thiết kế giao diện\.env.production` still pointed to retired `https://smart-health-api-xj0a.onrender.com`.
- Corrected the local production env to `https://smart-health-api-r5is.onrender.com` and added a tracked guard in `scripts/validate-product-env.mjs` that rejects retired `xj0a` URLs and requires API base to equal base URL plus `/api`.
- Verification passed: `npm.cmd run lint`, `npm.cmd run build:firebase:admin`, bundle scan for active `r5is`, Firebase deploy to `shcare-admin` version `projects/162993928259/sites/shcare-admin/versions/0d796ccc2368d21e`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783598280968000`, and live `npm.cmd run smoke:admin-mutation` run `admin-mutation-mrdgdbok` against `https://smart-health-api-r5is.onrender.com/api`.
- Follow-up smoke coverage now includes `/account`: run `admin-mutation-mrdgnc3d` checked the account settings route, profile/avatar/basic-info UI, security tab with password/2FA/sessions, notification tab, and backend `/api/auth/sessions` 200, while still mutating and cleaning workspace, package, patient, device, notification, storage bucket, and settings records.

## 2026-07-09 - Pixel_8_Pro_2 emulator restart root cause mitigation

- The emulator issue is a host/emulator driver problem, not an Android app crash. Windows logged repeated `0x00000133 DPC_WATCHDOG_VIOLATION` bugchecks when the AVD was booted earlier.
- The AVD data now lives on `D:\Android\avd\Pixel_8_Pro_2.avd`; the `.ini` under `C:\Users\baobe\.android\avd` points to that D path. C free space is about `27.7GB`.
- AEHD is stopped and demand-start (`Start=3`). The AVD config now uses cold boot, `hw.gpu.mode=swiftshader_indirect`, and `hw.cpu.ncore=2`.
- A software/no-accel boot did not crash the host, opened emulator console/ADB ports, but stayed `emulator-5554 offline`, matching the emulator warning that x86_64 images may not work without hardware acceleration.
- Windows `HypervisorPlatform` has been enabled and `bcdedit hypervisorlaunchtype auto` succeeded, but this boot still reports `HypervisorPresent=False`; a controlled restart is required before retrying WHPX-accelerated emulator QA. Do not return to AEHD/hardware-auto boot.

## 2026-07-09 - Shcare Portal UI density and search-field polish

- Follow-up after a user screenshot showed the portal search icon overlapping placeholder text and broader portal page density drifting too large/small across routes.
- `smart-health-web/src/web-styles/clinical-system.css` now adds a portal-specific density layer for titles, common text-size utilities, inputs/selects/textareas, premium buttons, table cells, and search fields. `.portal-search-field` owns icon placement and input left padding so the icon no longer collides with placeholder text.
- `PatientsPage.tsx`, `RecordsPage.tsx`, `AuditLogPage.tsx`, and `HelpPage.tsx` now use the shared `portal-search-field` pattern instead of route-specific absolute icon wrappers.
- Verification passed locally: Shcare Web `bunx tsc --noEmit --pretty false`, `bun run lint`, `bun run build:firebase`, local dev `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-browser`, targeted visual Playwright measurement for Patients/Records/Audit/Help on desktop plus Patients/Help on mobile, and scoped `git diff --check`.
- Visual QA measured portal titles at `21.44px`, search inputs at `44px` height, `14px` input text, `43.2px` left padding, about `12.809px` icon-to-text gap, and zero horizontal overflow on checked desktop/mobile viewports.
- Commit `ff9adec5` was pushed to `origin/main` and deployed to Firebase Hosting target `webapp`: version `projects/162993928259/sites/shcare/versions/a1b568cf873aac0d`, release `projects/162993928259/sites/shcare/channels/live/releases/1783594254847000`.
- Post-deploy verification passed: backend/public `npm.cmd run smoke:public-deployment`, live `bun run smoke:portal-browser` without local CORS bypass, and live visual Playwright measurement on `https://shcare.web.app` with the same density/search metrics and no severe console errors.
- Follow-up live density sweep checked 19 portal routes on `https://shcare.web.app` for horizontal overflow, H1 scale, portal input/search/button dimensions, search icon gap, logo image loading, and severe console/page errors. It passed with `checked=19`, `failing=[]`, `severe=[]`.

## 2026-07-09 - Provider/device validation re-probe after portal UI deploy

- Backend/local provider smoke pass: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:storage`, `npm.cmd run smoke:notification-push`, `npm.cmd run smoke:api-production`, `npm.cmd run smoke:workspace-access`, and `npm.cmd run smoke:repositories`.
- Live/provider smoke pass: `npm.cmd run smoke:public-deployment`, Firebase email verification link generation with local Firebase Admin env, `npm.cmd run smoke:production-roles` with `PUBLIC_BACKEND_URL=https://smart-health-api-r5is.onrender.com`, `npm.cmd run smoke:portal-production`, and live `bun run smoke:portal-browser`.
- `npm.cmd run smoke:mqtt` skipped because `MQTT_URL` is not set. Workspace-access notification email fanout skipped Brevo sends because `BREVO_API_KEY` and `BREVO_FROM_EMAIL` are not configured in this shell.
- Local production readiness remains blocked in this shell: `npm.cmd run check:production` reported `BLOCKED` with pass=3, warn=6, fail=7, manual=2; strict mode exited nonzero as expected. This reflects missing local production envs, not a failed live Render/Firebase API smoke.
- Android source/build pass: `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, and `.\gradlew.bat :app:testDebugUnitTest`.
- Firmware build pass: `C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run` passed both `esp32-s3-devkitm-1` and `esp32-s3-ota`.
- Hardware/provider blockers remain: `adb.exe` exists under the Android SDK but `adb devices` showed no attached device; `platformio device list` showed no ESP32-S3 serial device; backend `web-monitor` has no production `.env` file with S3/Postgres/PHI/MQTT provider secrets; Gmail inbox click-through still needs an authenticated mailbox/session.
- Emulator safety follow-up: attempts to boot `Pixel_8_Pro_2` correlated with three Windows bugchecks `0x00000133` (`DPC_WATCHDOG_VIOLATION`) at about 18:12, 18:17, and 18:26 on 2026-07-09. Event logs saved minidumps under `C:\Windows\Minidump\070926-*.dmp`; a simple string scan found `qemu-system` in the latest dump. Do not boot this AVD with AEHD/hardware acceleration until the crash path is isolated.
- To reduce C-drive pressure and avoid the previous AVD path, `Pixel_8_Pro_2.avd` was moved from `C:\Users\baobe\.android\avd` to `D:\Android\avd\Pixel_8_Pro_2.avd`, and `C:\Users\baobe\.android\avd\Pixel_8_Pro_2.ini` now points to the D path. C free space increased to about `27.6GB`.
- Android Emulator Hypervisor Driver `aehd` was stopped and changed from system start (`Start=1`) to demand start (`Start=3`). Future emulator tests should either use a physical device or a deliberately software-rendered/software-accelerated run; do not start `Pixel_8_Pro_2` normally from automation.

## 2026-07-09 - Android workspace switcher and dashboard context

- Follow-up after the broad completeness prompt found the Android counterpart to the portal workspace gap: Android `AuthUser` did not parse backend `currentWorkspace`, `currentMembership`, or `memberships`, so mobile Settings/Dashboard could not reflect the active workspace or switch between joined workspaces.
- `smart-health-android/app/src/main/java/com/example/smart_health_android/data/SmartHealthModels.kt` now has `WorkspaceSummary`, `WorkspaceMembership`, extended `AuthUser` workspace fields, and `workspaceOptions()` to combine current workspace plus membership rows.
- `SmartHealthApi.kt` now parses `/me` workspace context and exposes `switchWorkspace(workspaceId)` through backend `PATCH /api/v1/me` / `/api/me`, preserving backend membership enforcement instead of client-side tenant assignment.
- Added `WorkspaceSwitcherScreen.kt`, wired it from Settings, and updated doctor/patient dashboards to show the current workspace context. The switcher has backend loading, empty, error, active, and switching states and displays patient/device/online/scan/alert summaries from the backend contract.
- `smart-health-embedded/web-monitor/scripts/workspaceAccessSmokeTest.js` now seeds a doctor with a second beta membership and verifies successful `/api/v1/me` switch to `org_beta`, summary parsing, `currentMembership`, and switch-back to `org_alpha`. The existing workspace-admin self-join denial remains covered separately.
- Verification passed: backend `node .\scripts\workspaceAccessSmokeTest.js` (Brevo email sends skipped because env vars are absent), Android `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, and `.\gradlew.bat :app:testDebugUnitTest`. Emulator/physical-device visual proof is still pending.
- Same-turn hardware/firmware probe: `adb devices` returned only the header with no attached Android device, `platformio device list` returned no ESP32-S3 serial entry, and `C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run` in `smart-health-embedded\MSM261S4030H0` passed both `esp32-s3-devkitm-1` and `esp32-s3-ota` builds. This proves firmware source build health, not physical WiFi/audio/OTA behavior.

## 2026-07-09 - Shcare Portal workspace summary contract follow-up

- Follow-up after the broad completeness prompt found another "UI present but not fully connected" gap: `/portal/workspace` displayed patient/device/alert counters, but `smart-health-web/src/app/context/AuthContext.tsx` mapped every workspace membership counter to `0` because backend `/api/me` did not return operational workspace summaries on memberships/current workspace.
- `smart-health-embedded/web-monitor/server.js` now computes per-workspace operational summary for `/api/me`, `/api/v1/me`, memberships, and `publicWorkspace`: patient count, device count, online device count, alert/offline count, and scan count. The summary is derived from scoped patients/devices/scans instead of placeholder frontend state.
- `smart-health-web/src/lib/smart-health-api.ts` now types the workspace summary/count fields, and `AuthContext.tsx` maps membership/current-workspace counts with numeric fallback. `WorkspaceSwitcher.tsx` now awaits workspace switching, shows switching/error states, uses accessible button cards, and exposes stable smoke selectors for workspace cards/counts.
- `smart-health-web/scripts/portalBrowserSmokeTest.mjs` now verifies `/portal/workspace` renders workspace cards with numeric patient/device/alert summaries and one active workspace. `smart-health-embedded/web-monitor/scripts/workspaceAccessSmokeTest.js` now asserts exact `/me` currentWorkspace and membership counts for the seeded `org_alpha` workspace.
- Source verification passed: backend `node --check server.js`, backend `node --check scripts\workspaceAccessSmokeTest.js`, backend `npm.cmd run smoke:workspace-access`, backend `npm.cmd run check`, Shcare Web `node --check scripts\portalBrowserSmokeTest.mjs`, `bunx tsc --noEmit --pretty false`, targeted `bunx eslint src/app/context/AuthContext.tsx src/app/pages/portal/WorkspaceSwitcher.tsx src/lib/smart-health-api.ts`, `bun run build`, and local dev `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-browser` against `http://127.0.0.1:8080`.
- Production follow-up completed in commit `2b3d21a3` pushed to `origin/main`. Firebase Hosting target `webapp` deployed `shcare` version `projects/162993928259/sites/shcare/versions/4f370368cfbe2403`, release `projects/162993928259/sites/shcare/channels/live/releases/1783592537850000`. Live verification passed without the local CORS bypass: `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:portal-production`, `bun run smoke:portal-browser` with `/portal/workspace` summary cards, and `bun run smoke:portal-mutation` run `portal-mutation-mrdczthd` with patient/device/notification/share/settings/support cleanup.

## 2026-07-09 - Patient-share repository persistence and Supabase schema follow-up

- Follow-up after the portal consent workflow found a backend data gap: patient-share grants were still primarily runtime/JSON-backed even though `doctor_patient_access` exists in Postgres. `smart-health-embedded/web-monitor/src/repositories.js` now has a `patientShares` repository with SQL-backed list/find/save/revoke, runtime fallback, `scan_ids` JSONB mapping, `scope`, expiry, revoked metadata, and core-state hydration from normalized SQL.
- `smart-health-embedded/web-monitor/server.js` now routes `GET/POST/DELETE /api/portal/patients/:id/shares` through `repositories.patientShares` when repositories are available, while preserving the JSON fallback.
- Added migration `smart-health-embedded/web-monitor/db/migrations/009_doctor_patient_access_runtime_parity.sql` and JSON-to-Postgres migration support for existing `db.doctorPatientAccess` grants.
- Supabase production project `smart-health-production` (`mahvymyncxszvuhlycwp`) has app `schema_migrations` entry `009_doctor_patient_access_runtime_parity` applied at `2026-07-08 22:51:36+00`. Verified schema now has nullable `doctor_user_id`, `doctor_id`, `scope`, `scan_ids`, `revoked_by_user_id`, `updated_at`, no old `(doctor_user_id, patient_id)` unique constraint, and patient/doctor/workspace indexes.
- Local backend verification passed after the repository change: `node --check src\repositories.js`, `node --check server.js`, `node --check scripts\migrateJsonToPostgres.js`, `node --check scripts\repositoriesSmokeTest.js`, `npm.cmd run smoke:repositories`, `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run smoke:workspace-access`.
- Live follow-up after commit `18534eba` found a real consistency bug: `POST /api/portal/patients/:id/shares` returned a share id, but immediate `GET /shares` returned an empty list and the deployed portal mutation smoke timed out waiting for the new share row. Source fix now merges SQL rows with runtime shares in `repositories.patientShares.listForPatient`, adds a repository smoke regression for create-then-list, and optimistically writes the created share into the portal React Query cache.
- Deployed follow-up fix `c00f35f3` to `origin/main` and redeployed Shcare Web to Firebase Hosting version `projects/162993928259/sites/shcare/versions/9109e5cb08b4fd0d`, release `projects/162993928259/sites/shcare/channels/live/releases/1783553006684000`.
- Post-deploy live verification passed: `npm.cmd run smoke:public-deployment`, direct share create/list canary run `direct-share-mrcphdbi-1` saw share `share_20260708232540_f6af5d2b` in immediate `GET /shares`, `npm.cmd run smoke:portal-production`, and `bun run smoke:portal-mutation` run `portal-mutation-mrcpi0yj` created/revoked share `share_20260708232751_88243994` with full cleanup.
- Render CLI, Supabase CLI/psql, and local `DATABASE_URL` are not present in this PowerShell process. The live API/UI create-list-revoke path is verified, but row-level proof that a newly-created live share lands in normalized Supabase `doctor_patient_access` still needs Supabase query access or Render DB/log access.

## 2026-07-09 - Android patient Data Access consent history

- Follow-up after the broad completeness checklist identified patient/family consent history as a remaining software slice. `smart-health-android/app/src/main/java/com/example/smart_health_android/ui/screens/DataAccessScreen.kt` no longer uses local-only privacy switches; it now loads real patient profiles, share targets, and `PatientShare` grants from the backend.
- Android Data Access now shows the selected profile, active share count, consent history, full-profile vs selected-scan scope, expiry, active/revoked state, target labels, loading/error/empty/retry states, and can revoke an active consent through the backend.
- `SmartHealthApi.kt` now exposes `revokePatientShare(patientId, shareId)` using `DELETE /api/patients/:id/shares/:shareId`, and `PatientShare` now carries `doctorId`, `revokedAt`, `createdAt`, and `updatedAt` metadata for the UI.
- Backend `GET /api/v1/patients/:id/shares` now requests repository `includeRevoked` and the JSON fallback no longer drops revoked grants, so Android consent history can show active and revoked rows consistently.
- `smart-health-embedded/web-monitor/scripts/workspaceAccessSmokeTest.js` now seeds a personal patient account, self/dependent family profiles, and verifies patient login capabilities, personal profile isolation, dependent profile creation, share-target lookup, consent create/list/revoke, revoked-history visibility, and denial of a workspace-owned patient profile.
- Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin` and `.\gradlew.bat :app:assembleDebug`; backend `node --check server.js`, `node --check scripts\workspaceAccessSmokeTest.js`, `npm.cmd run smoke:workspace-access`, `npm.cmd run check`, `npm.cmd run smoke:repositories`, and `npm.cmd test`. Commit `fde6ae4c` was pushed to `origin/main`; live `npm.cmd run smoke:public-deployment` passed and `npm.cmd run smoke:portal-production` passed on rerun after one transient Render 502. Physical Android device/FCM delivery remains separate provider-device validation because this shell has no attached Android device.

## 2026-07-09 - Android account password backend bridge

- Follow-up in Android settings/account security found `ChangePasswordScreen.kt` only updated Firebase locally and did not call the backend `/api/v1/me/password` audit/notification contract.
- `SmartHealthApi.changePassword` now accepts `firebaseClientUpdated`, and `ChangePasswordScreen.kt` updates Firebase when a Firebase user exists, refreshes the ID token into `SmartHealthRepository.api`, then records the change through the backend with `firebaseClientUpdated=true`. Demo/backend-password sessions still call the backend with current/new password directly.
- `workspaceAccessSmokeTest.js` now also verifies the backend password endpoint by changing the seeded patient password, rejecting the old password, and accepting the new password in the temporary JSON backend.
- Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, backend `node --check scripts\workspaceAccessSmokeTest.js`, and backend `npm.cmd run smoke:workspace-access`. Real Android UI execution still needs an attached emulator/device.

## 2026-07-09 - Android Privacy 2FA backend bridge

- Follow-up in Android `PrivacyScreen.kt` found the 2FA switch was local-only while backend `/api/v1/me/2fa` already stores 2FA setup state, secret preview, and recovery codes.
- `AuthUser` now parses `twoFactorEnabled`, `twoFactorMethod`, and `twoFactorSecretPreview`; `SmartHealthApi.updateTwoFactor()` calls `/me/2fa`; `PrivacyScreen.kt` loads the current backend 2FA state, enables/disables it through the backend, shows returned recovery codes, and keeps biometric disabled with a clear not-available state until native BiometricPrompt is implemented.
- `workspaceAccessSmokeTest.js` now verifies patient backend 2FA enable/disable and recovery-code response in the temporary JSON backend.
- Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin`, Android `.\gradlew.bat :app:assembleDebug`, backend `npm.cmd run smoke:workspace-access`, and backend `npm.cmd run check`. Real OTP provider/enforcement is still a backend/provider follow-up; this slice closes Android UI-to-backend setup, not full OTP challenge enforcement.

## 2026-07-09 - Android Privacy auth session management

- Follow-up in Android `PrivacyScreen.kt` found account sessions were available in backend and Shcare Portal settings through `/api/v1/auth/sessions`, but Android Privacy had no session list/revoke UI.
- `SmartHealthApi.kt` now exposes `listAuthSessions()` and `revokeAuthSession(sessionId)`; `SmartHealthModels.kt` adds `AuthSession`; `PrivacyScreen.kt` loads backend sessions, shows current-session and revoke states, and revokes non-current sessions through the backend.
- Backend demo auth fallback was hardened in `server.js`: if a request sends a bearer token that is invalid, expired, or revoked, `requireUser()` no longer falls back to the default platform admin user. Demo fallback is retained only for requests without any bearer token.
- `workspaceAccessSmokeTest.js` now opens a second patient session, lists the patient's sessions, revokes the non-current session, and verifies the revoked token cannot access `/api/v1/me`.
- Verification passed: backend `node --check server.js`, backend `node --check scripts\workspaceAccessSmokeTest.js`, backend `npm.cmd run smoke:workspace-access`, backend `npm.cmd run check`, Android `.\gradlew.bat :app:compileDebugKotlin`, and Android `.\gradlew.bat :app:assembleDebug`. Real Android visual/runtime proof still needs an attached emulator or physical device.

## 2026-07-09 - Android family profile management

- Follow-up after the patient/family contract work found Android could create dependent profiles only from New Scan, while Settings had no dedicated family-profile management surface.
- Added `FamilyProfilesScreen.kt` and a Settings route for `Hồ sơ gia đình`. The screen lists backend patient/family profiles, edits existing profiles, creates dependent profiles, and deletes non-self dependent profiles through real backend patient APIs.
- `SmartHealthApi.kt` now exposes `updatePatient()` and `deletePatient()` beside the existing patient list/create/share calls.
- `workspaceAccessSmokeTest.js` now verifies a patient can create, update, delete, and no longer read a dependent family profile, while cross-workspace patient update remains forbidden.
- Verification passed: Android `.\gradlew.bat :app:compileDebugKotlin` and backend `node --check scripts\workspaceAccessSmokeTest.js` plus `npm.cmd run smoke:workspace-access`. Real visual/runtime proof still needs an attached emulator or physical Android device.

## 2026-07-09 - Shcare Portal consent/share live follow-up

- Source follow-up after the broader completeness audit found `/portal/consent` had backend share APIs but weak browser workflow coverage. `smart-health-web/src/app/pages/portal/InvitationsPage.tsx` now supports patient selection, doctor/workspace target selection, full-profile vs selected-scan scope, optional expiry, friendly target labels, active share list, and revoke controls backed by `/api/share-targets` plus `/api/portal/patients/:id/shares`.
- `smart-health-web/src/lib/smart-health-api.ts` now has typed `ShareTarget` and `PatientShare` contracts so the portal uses the backend share shape instead of raw records.
- Shcare Portal smoke coverage was expanded so `smoke:portal-browser` asserts the consent/share controls and selected-scan scope UI, while `smoke:portal-mutation` creates a patient share through the deployed portal UI, verifies backend `POST /shares` 201, revokes it with `DELETE /shares/:shareId` 200, and keeps cleanup fallback if the run aborts.
- Verification passed locally: `bunx tsc --noEmit --pretty false`, `bun run lint`, `bun run build`, `bun run build:firebase`, local preview `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-browser`, and local preview mutation run `portal-mutation-mrcnhpos` with share `share_20260708223119_d7cd23c4` created and revoked.
- Live completion passed: Firebase Hosting deploy target `webapp` released `shcare.web.app` version `projects/162993928259/sites/shcare/versions/87657f16c15d9fc5`, release `projects/162993928259/sites/shcare/channels/live/releases/1783550011942000`; live `bun run smoke:portal-browser` and live `bun run smoke:portal-mutation` run `portal-mutation-mrcnnzcg` passed without `SMOKE_DISABLE_WEB_SECURITY`, creating and revoking share `share_20260708223625_e69f019e`.
- Local preview without `SMOKE_DISABLE_WEB_SECURITY=1` is still blocked by backend CORS because Render allows Firebase Hosting origins, not `localhost:8080`; this is expected for local source QA and live smoke must continue to run without the bypass flag.

## 2026-07-09 - Shcare Portal account settings and skill-routing hardening

- Source follow-up after discovering `/portal/settings` only covered workspace fields: `smart-health-web/src/app/pages/portal/WorkspaceSettings.tsx` now covers personal profile, avatar upload/download/delete, password change, 2FA enable/disable, auth sessions/revoke controls, notification preferences, and workspace settings in one portal settings surface.
- `smart-health-web/src/lib/smart-health-api.ts` now exposes the same account/security backend contract already used by Web Admin: `/me/avatar`, `/me/password`, `/me/2fa`, `/auth/sessions`, and session revoke. `smart-health-web/src/lib/firebase-client.ts` now supports Firebase reauthentication plus password update before the backend audit call.
- Shcare Portal smoke coverage was expanded so `smoke:portal-browser` fails if settings lacks profile/security/notification/workspace controls, and `smoke:portal-mutation` now mutates/restores account profile title, notification preferences, workspace website, and validates security controls without changing the smoke account password.
- Local verification passed against local `http://127.0.0.1:8080` frontend and production-like Render backend `https://smart-health-api-r5is.onrender.com/api`: `bunx tsc --noEmit`, `bun run lint`, `bun run build`, `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-browser`, and `SMOKE_DISABLE_WEB_SECURITY=1 bun run smoke:portal-mutation` run `portal-mutation-mrclhqx7` with profile/workspace/preferences cleanup all OK.
- Live completion also passed: `bun run build:firebase`, Firebase Hosting deploy target `webapp`, `shcare.web.app` version `projects/162993928259/sites/shcare/versions/56a468bd5b4c852d`, release `projects/162993928259/sites/shcare/channels/live/releases/1783546949244000`, live `bun run smoke:portal-browser`, and live `bun run smoke:portal-mutation` run `portal-mutation-mrclugrb` without `SMOKE_DISABLE_WEB_SECURITY`.
- Global/project routing rules were updated to use a task skill bundle for broad Smart Health work, not a single minimal skill: `smart-health-project` + context gates, then UI/UX, React/web, QA/browser, security/auth/data, deploy, and handoff skills as materially applicable.

## 2026-07-09 - Render backend account migration and Firebase redeploy

- Recreated the Render backend in the new Render account/workspace because the old `smart-health-api-xj0a` workspace exceeded the free outbound bandwidth limit and Render does not support direct service transfer between workspaces.
- Current active backend is `https://smart-health-api-r5is.onrender.com` with API base `https://smart-health-api-r5is.onrender.com/api`. Render logs showed Postgres migrations skipped/applied, normalized state loaded from Postgres, Firebase auth enabled, production auth mode, UDP audio on port 3001, and HTTP on Render port 10000.
- Updated operational defaults and CI/deploy wiring from `smart-health-api-xj0a` to `smart-health-api-r5is` in Shcare Web production env, backend smoke defaults, Web Admin mutation smoke, Android debug default, GitHub workflows, README files, and the project index.
- Rebuilt and redeployed Firebase Hosting: `shcare.web.app` version `projects/162993928259/sites/shcare/versions/ad466c939950664e`, release `projects/162993928259/sites/shcare/channels/live/releases/1783533994996000`; `shcare-admin.web.app` version `projects/162993928259/sites/shcare-admin/versions/35d5d0458143d1b4`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783534018473000`.
- Verification passed against the new backend: `/api/health` 200, `/api/v1/health` 200, `/api/me` expected 401 unauthenticated, backend `npm.cmd run check`, `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`, Shcare Web `bun run build:firebase`, `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` run `portal-mutation-mrce7zqs`, Web Admin `npm.cmd run build:firebase:admin`, and `npm.cmd run smoke:admin-mutation` run `admin-mutation-mrcebq30`.
- Live asset scan after deploy found `smart-health-api-r5is` in the served bundles and no `smart-health-api-xj0a`. The Web Admin bundle still contains a guarded `localhost:3000` fallback constant, but runtime production env points at `smart-health-api-r5is`.
- This migration restores service availability but does not solve the underlying Render outbound bandwidth risk. The prior Render usage showed most bandwidth under Service-Initiated traffic, so a follow-up should inspect backend-initiated storage/provider traffic and reduce or bypass backend egress where possible.

## 2026-07-07 - Android/backend AI and data contract sync

- Rerouted the remaining Android-facing backend AI/data drift in `smart-health-embedded/web-monitor/server.js`: `/api/v1/ai/chat` is now user+workspace scoped instead of returning global chat history, `/api/v1/ai/settings` and `/api/v1/ai/update` persist through the same mutable workspace settings path as the admin settings API, and `/api/v1/data/cache` returns a scoped storage summary after clearing cache.
- Scoped AI update notifications from both `/api/v1/ai/update` and `/api/v1/settings/ai/update` with `userId` and `organizationId`, so workspace users do not create global AI-update notices visible across tenants.
- Expanded `npm.cmd run smoke:workspace-access` to seed cross-tenant AI chat history and verify AI chat isolation, AI settings/update persistence, scoped AI update notifications, Android data summary/cache scoping, and workspace denial for destructive Android data reset.
- Local verification for this slice passed: backend `npm.cmd run check`, backend `npm.cmd run smoke:workspace-access`, backend `npm.cmd test`, Shcare Web `npm.cmd run build`, Web Admin `npm.cmd run build`, and Android `.\gradlew.bat :app:assembleDebug`.
- This closes the local source-level mismatch where Android global utility endpoints could read/update shared runtime state while portal/admin paths were already workspace-aware. Provider/hardware validations remain separate blockers and should not be confused with this source-contract slice.

## 2026-07-07 - Broad prompt requirements handoff

- Read and processed `C:\Users\baobe\.codex\attachments\05fe3f5d-461a-44e0-a201-f791d201f845\pasted-text.txt`, which asks for full Smart Health product hardening across role/auth/register/approval/RBAC, portal/admin/Android/backend/device/storage/notification consistency, verification, deploy, and handoff.
- Added `docs/SMART_HEALTH_PROMPT_REQUIREMENTS_HANDOFF.md` as the anti-repeat ledger for that prompt. It records product invariants, repo map, closed slices, live deploy versions, smoke run ids, remaining Blocker/High/Medium/Polish work, and the next recommended non-repeated slice.
- Treat the first requested slice, Role/Auth/Register/Approval/RBAC, as closed in the current deployed source unless new evidence regresses it: commit `88877ad5` is pushed, Firebase Hosting live versions are `fab6a2ad97c63420` for Shcare Web and `ce26044bb3730062` for Web Admin, and live portal/admin mutation smokes cleaned up run ids `portal-mutation-mrad4yzw` and `admin-mutation-mrad8n0r`.
- Next-slice probe: `npm.cmd run check:production:strict` was rerun from the local backend shell and still reports `BLOCKED` because this PowerShell process does not have production envs such as Firebase Admin, public backend URL, `DATA_BACKEND=postgres`, `DATABASE_URL`, S3/object storage, and `PHI_ENCRYPTION_KEY`. Do not rerun this as the repository-backed tenant isolation slice unless a production-env shell or Render/Supabase access is available.

## 2026-07-07 - Supabase/Postgres repository parity probe

- The installed Supabase connector is usable for Smart Health. It confirmed project `smart-health-production` (`mahvymyncxszvuhlycwp`) is healthy on Postgres 17.6, with migrations `001_init` through `008_notification_push_attempts` applied.
- Direct DB checks showed public tables have RLS enabled, `anon` and `authenticated` have no direct public table grants, and there are no permissive public policies in `pg_policies`.
- The connector found a real normalized/runtime drift: `app_runtime_state` counted `organizations=9` while normalized `public.organizations` had `10`. The missing runtime org was `org_admin_mutation_mrad8n0r`, which only had audit-log references left from the admin mutation smoke.
- Backend repository hydration was hardened so normalized SQL rows are authoritative even when a table returns zero rows; stale runtime snapshot rows no longer survive an empty SQL table. Optional FK upserts for user `patient_id`, patient `owner_user_id`, and device `paired_user_id` now null missing references instead of throwing FK violations.
- Verification passed locally: `node --check src\repositories.js`, `node --check scripts\repositoriesSmokeTest.js`, `npm.cmd run smoke:repositories`, `npm.cmd run check`, and `npm.cmd run smoke:workspace-access`.
- Deployed through commit `6d902355` pushed to `origin/main`. Live `npm.cmd run smoke:public-deployment` and `npm.cmd run smoke:portal-production` passed, and Supabase confirmed `app_runtime_state` is synced again (`runtime_organizations=10`, `normalized_organizations=10`, updated at `2026-07-07 11:54:34+00`).

## 2026-07-07 - Storage contract and performance smoke follow-up

- `smoke:workspace-access` now covers storage share URL generation, authenticated local-object URL read, cross-workspace signed URL denial, direct download content, upload/list/download/delete, and post-delete 404.
- Added `smart-health-web/scripts/performanceSmokeTest.mjs` plus `bun run smoke:performance`. It signs into live `https://shcare.web.app` with the workspace smoke account, measures public home/login and portal dashboard/patients/records/devices/settings, enforces route budgets, and fails on console/page errors or blank renders.
- Verification passed: `node --check scripts\workspaceAccessSmokeTest.js`, `npm.cmd run smoke:workspace-access`, `node --check scripts\performanceSmokeTest.mjs`, and `bun run smoke:performance`.
- Latest live performance smoke stayed within budgets: public home transferred about 4.45 MB and loaded in about 0.8-5.1s across reruns, while authenticated portal routes loaded in about 0.4-1.3s after login.
- Follow-up live Firebase checks passed after loading the local service account path: `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`, `npm.cmd run smoke:firebase-email`, and `npm.cmd run smoke:public-deployment`.
- Commit `edd419ef` was pushed to `origin/main`; post-push live `npm.cmd run smoke:public-deployment` and `npm.cmd run smoke:portal-production` passed.
- Hardware/device probes found no attached Android device (`adb.exe devices` empty) and no ESP32-S3 serial device (`platformio device list` empty), so real FCM delivery and physical MSM261 WiFi/audio/OTA evidence still require connected hardware and a real registered device token.

## 2026-07-07 - Whole-system verification and admin device mutation hydration fix

- Whole-system verification rerun passed across backend `check`, backend `test`, `smoke:workspace-access`, `smoke:repositories`, Shcare Web lint/typecheck/Firebase build/performance smoke/portal browser smoke, Web Admin lint/Firebase build, Android `:app:compileDebugKotlin`, MSM261 normal/OTA PlatformIO build, public deployment smoke, production role smoke, and authenticated portal production smoke.
- Live Web Admin mutation smoke initially failed when PATCH `/devices/dev_admin_mutation_*` returned 404 after `/devices/provision-qr` returned 201. Browser-context debug showed a background `/devices` list could hydrate from normalized SQL and drop a new runtime device before PATCH when the SQL list did not yet contain the just-created device.
- Commit `27f309be` preserves runtime-created patients/devices during repository list hydration while keeping startup `hydrateCoreState()` authoritative for stale snapshot cleanup. Regression coverage was added in `scripts/repositoriesSmokeTest.js`.
- Post-deploy live `npm.cmd run smoke:admin-mutation` passed with run id `admin-mutation-mran2ji6`; device PATCH returned 200 and cleanup returned HTTP 200 for settings, notification, storage bucket, device, patient, package, and workspace.

## 2026-07-07 - Provider and hardware validation re-probe

- Continued the remaining provider/device slice in a network-enabled local shell. Backend verification passed: `npm.cmd run check`, `npm.cmd test`, `npm.cmd run smoke:firebase-email`, `npm.cmd run smoke:storage`, `npm.cmd run smoke:notification-push`, `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`, `npm.cmd run smoke:workspace-access`, `npm.cmd run smoke:repositories`, and `npm.cmd run smoke:api-production`. `npm.cmd run smoke:mqtt` skipped because `MQTT_URL` is not set.
- `smoke:firebase-email` passed after loading `FIREBASE_PROJECT_ID=smart-health-stethoscope` and the local Firebase Admin JSON path. This proves Firebase Admin can generate a verification action link for `https://shcare.web.app/xac-nhan-email`; it still does not prove Gmail inbox receipt or click-through.
- Live browser/mutation/build verification also passed: Shcare Web `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` run `portal-mutation-mraqouwy`, `bun run smoke:performance`, `bun run lint`, `bunx tsc --noEmit --pretty false`, and `bun run build:firebase`; Web Admin `npm.cmd run smoke:admin-mutation` run `admin-mutation-mraqkmzo`, `npm.cmd run lint`, and `npm.cmd run build:firebase:admin`; Android `:app:compileDebugKotlin`, `:app:assembleDebug`, and `:app:assembleRelease`; MSM261 PlatformIO `esp32-s3-devkitm-1` and `esp32-s3-ota`.
- Chrome/Gmail was previously opened to the Google sign-in page instead of an authenticated inbox, so real Gmail inbox receipt/click-through still requires the user to sign in or provide mailbox/API credentials. Do not claim inbox delivery complete from Firebase link generation alone.
- Current local process envs for strict provider checks remain incomplete (`AUTH_MODE`, Firebase Admin process envs, public backend URL, `DATA_BACKEND`, `DATABASE_URL`, S3/Supabase Storage envs, `PHI_ENCRYPTION_KEY`, Brevo/SMTP/SMS/Zalo/MQTT envs), so local `npm.cmd run check:production` still reports `BLOCKED` even though the live smoke suite passes with explicit Firebase credentials.
- Hardware/tool probes found Android SDK `adb.exe` but no attached devices (`adb devices` only printed the header), and `platformio device list` returned no ESP32-S3 serial device. `render`, `supabase`, `firebase`, and `gcloud` CLIs were not on PATH. Real Android FCM, physical MSM261 validation, and direct provider-host management still require external session/env/hardware access.

## 2026-07-07 - Workspace owner approval lifecycle

- Product invariant for auth/role work: `/register/phong-kham` creates a `workspace_owner` request through `/api/auth/workspace-request`; doctor registration creates only a doctor request; `shcare-admin.web.app` approves workspace/facility owners from the workspace screen, while doctor approval remains doctor-only.
- Backend workspace approval now supports `pending`, `needs_info`, `rejected`, and `approved` (`active`) owner transitions. Approving a workspace grants backend `workspace_owner`, updates/preserves Firebase custom claims when Firebase Admin is configured, and returns portal access; pending/needs-info/rejected keep the owner as `patient` for surface gating.
- Firebase auth refresh no longer moves an already approved workspace role to `org_default_clinic` when the token lacks an organization claim, and approved workspace roles are preserved from backend state instead of being demoted to patient.
- Web Admin `Clinics.tsx` is now a workspace approval surface with pending/needs-info/rejected/approved/tạm khóa filters and explicit approve, request-info, reject, and reopen-pending actions. The detail drawer uses backend values instead of fake legal/subscription/timeline values.
- Shcare Web `/can-bo-sung` branches by `requestedRole`: doctors resubmit through `/auth/role-request`, while workspace owners resubmit facility data through `/auth/workspace-request`.
- Verification passed locally: backend `npm.cmd run check`, backend `npm.cmd test`, Web Admin `npm.cmd run lint`, and Shcare Web `bunx tsc --noEmit --pretty false`. The backend smoke suite now includes workspace-owner pending -> needs_info -> resubmit -> rejected -> resubmit -> approved lifecycle and portal surface assertions.

## 2026-07-07 - Account profile tenant hardening

- Backend `/api/v1/me` profile updates no longer treat display `hospital` text as a workspace switch and no longer auto-create membership from self-service profile edits.
- Explicit profile workspace switching through `organizationId` / `clinicId` / `clinic` is allowed only for an existing membership, with platform admins remaining platform-scoped. Unauthorized self-switch attempts return `WORKSPACE_MEMBERSHIP_REQUIRED`.
- `npm.cmd run smoke:workspace-access` now asserts a workspace admin cannot patch `/api/v1/me` from `org_alpha` into `org_beta`; the account remains in the original workspace after the denied attempt.
- Setup guide was sanitized so Brevo/API keys are referenced as ignored env vars only, not stored inline in docs.

## 2026-07-07 - Device transfer hardening

- Device `transfer` remains platform-admin-only, and now validates the target workspace exists before mutating the device.
- If `ownerUserId` is supplied during transfer, the target user must exist and belong to the target workspace or already have membership there.
- `npm.cmd run smoke:workspace-access` now covers non-platform transfer denial, missing-workspace transfer denial, mismatched-owner denial, and a valid platform transfer to a matching workspace user.

## 2026-07-07 - Selected scan sharing hardening

- `GET /api/v1/scans` now filters each scan through `canAccessScan`, matching scan detail/audio access policy.
- A doctor with a `selected_scans` grant can list the granted scan plus their own workspace scans, but cannot list or open sibling scans for the shared patient.
- `npm.cmd run smoke:workspace-access` now seeds a selected-scan grant and asserts the sibling scan is hidden from list and denied on detail.

## 2026-07-07 - Notification target scoping

- Non-platform callers creating notifications can target only themselves or users in the same workspace/membership. Cross-workspace `userId` targets now return 403.
- `POST /api/v1/notifications` normalizes target ids to backend user ids and returns 404 for missing users.
- `npm.cmd run smoke:workspace-access` now verifies same-workspace direct notification creation and cross-workspace target denial.

## 2026-07-07 - Export workspace validation

- Platform export creation now rejects missing target workspaces instead of creating export metadata for arbitrary `organizationId` values.
- Workspace users creating exports are still forced to their current workspace even if the payload contains another `organizationId`.
- `npm.cmd run smoke:workspace-access` now covers both cases.

## 2026-07-07 - Live UI dead-control and mobile overflow verification

- Refreshed live role smoke credentials with `npm.cmd run smoke:production-roles`; platform admin, workspace admin, and doctor portal accounts still resolve to the expected surfaces on Render/Firebase.
- Live Shcare Portal browser smoke passed: `bun run smoke:portal-browser` covered Firebase login, portal API reads, records filters, sidebar route buttons, avatar/notification popovers, device claim route, and audit navigation.
- Live Shcare Portal controlled mutation smoke passed with cleanup through `node scripts/portalMutationSmokeTest.mjs`: patient create/update/delete, device provision/claim/assignment/restore, notification create/read/delete, workspace settings/preferences restore, report CSV export, support ticket cleanup, logout, and session recovery.
- Live Web Admin controlled mutation smoke passed with cleanup through `npm.cmd run smoke:admin-mutation`: workspace, package, patient, device, notification, storage bucket, and settings mutations all returned expected API statuses and cleanup succeeded.
- Additional 390x844 Playwright mobile overflow pass found `overflow=0` and no console/page errors on public home/login/register/workspace-register, unauthenticated portal deep link redirect, authenticated portal dashboard/patients/devices/records/settings, admin login, and authenticated admin overview/devices/clinics/settings.

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

## 2026-07-04 - Notification push delivery backend path

- Backend notification creation now queues Firebase Cloud Messaging delivery for direct user notifications that have `userId` and registered enabled FCM tokens. Platform-admin email fanout remains separate and is not overwritten by push status.
- Added notification push persistence columns through migration `007_notification_push_delivery.sql`: `push_status`, `push_sent_at`, `push_failed_at`, and `push_error_message`.
- `notificationDevices` repository now supports listing enabled tokens per user and disabling invalid/unregistered FCM tokens after Firebase rejects them.
- Added `npm.cmd run smoke:notification-push`, which starts a temporary JSON backend, registers a fake Android FCM token, creates a user-targeted notification, and verifies the local no-Firebase case records `pushStatus=skipped` instead of crashing.
- Verified: `npm.cmd run smoke:notification-push`, `npm.cmd run check`, `npm.cmd run smoke:workspace-access`, and `npm.cmd run smoke:repositories` passed.

## 2026-07-05 - Notification push retry history

- Added migration `008_notification_push_attempts.sql` so notifications persist `push_attempts` JSONB alongside aggregate push delivery status.
- Backend push delivery now records per-attempt history in `pushAttempts` without storing raw FCM tokens. Token references are short SHA-256 hashes, and each attempt records status, provider, retryability, invalid-token flag, attempt number, safe error text, and timestamp.
- Retryable FCM failures are retried through `PUSH_NOTIFICATION_MAX_RETRIES` (default 1, capped 0-3) and `PUSH_NOTIFICATION_RETRY_MS` (default 30000ms, bounded 1000-300000ms). Invalid/unregistered tokens are still disabled instead of retried.
- `npm.cmd run smoke:notification-push` now asserts the local no-Firebase case writes a `pushAttempts[0]` entry with `status=skipped` and provider `fcm`.
- Verified: `npm.cmd run check`, `npm.cmd run smoke:notification-push`, `npm.cmd run smoke:repositories`, and `npm.cmd run smoke:workspace-access` passed. Real Android FCM delivery still needs a Firebase-enabled deployed backend and real device token.

## 2026-07-05 - Authenticated portal production smoke

- Added `npm.cmd run smoke:portal-production`. It reads the temporary smoke credentials generated by `npm.cmd run smoke:production-roles`, signs in through Firebase Identity Toolkit, and verifies live Render portal access without printing passwords or ID tokens.
- The smoke checks that platform admin is blocked from `/api/portal/status` with 403, workspace admin can read `/api/me`, portal status/overview/patients/scans/notifications/devices/monitoring/reports/audit-log/settings, and doctor can read `/api/me`, portal status/overview/patients/scans/notifications.
- Verified against `https://smart-health-api-xj0a.onrender.com`: `npm.cmd run smoke:production-roles`, `npm.cmd run check`, and `npm.cmd run smoke:portal-production` passed.
- This closes the automated live authenticated portal API smoke slice. Destructive/mutation browser E2E still needs a controlled test plan that creates and restores/deletes test data.

## 2026-07-05 - Portal browser smoke and dropdown layering

- Fixed the user-reported Shcare Portal avatar dropdown layering issue. `clinical-system.css` now isolates the portal shell, raises the topbar layer, raises `.clinical-popover`, and keeps `.clinical-content` below it; `signal-horizon.css` mirrors those topbar/popover overrides so the final theme layer cannot put filter/table cards over avatar or notification menus.
- Added `smart-health-web/scripts/portalBrowserSmokeTest.mjs` plus `bun run smoke:portal-browser`. The smoke signs into `https://shcare.web.app` with the temporary workspace smoke account from `web-monitor\.test-data\production-role-smoke-credentials.json`, checks Firebase `/api/auth/firebase`, portal APIs, records search/status filters, avatar popover, notification popover, full read-only portal route coverage, and the audit link inside the avatar menu. It redacts auth headers and does not print passwords or ID tokens.
- Deployed the dropdown fix to Firebase Hosting site `shcare`: version `projects/162993928259/sites/shcare/versions/245f0489b45b35dc`, release `projects/162993928259/sites/shcare/channels/live/releases/1783249399391000`.
- Verified: `bun run smoke:portal-browser`, `bun run lint`, `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, backend `npm.cmd run smoke:portal-production`, and `git diff --check` passed. The browser smoke measured avatar/notification popovers at `z-index=120`, topbar `z-index=80`, content `z-index=1`, with the avatar menu overlapping the records filter panel without being occluded.

## 2026-07-05 - Portal mutation smoke tooling

- Added stable QA selectors to portal patient create/detail/delete, device assignment, notification read/delete, reports CSV export, workspace settings, notification preferences, help/support ticket, and topbar logout controls.
- Expanded `portalBrowserSmokeTest.mjs` beyond the first route set so read-only smoke also visits live monitoring, consent, staff, alerts, onboarding, help, workspace switcher, billing, review queue, and device assignment routes.
- Help page quick-guide cards now use lucide icons instead of emoji, behave as real buttons that prefill support-ticket type/description, and keep hotline/email rows in the same icon system.
- Added `smart-health-web/scripts/portalMutationSmokeTest.mjs` plus `bun run smoke:portal-mutation`. The smoke signs into `https://shcare.web.app` with the workspace smoke account, creates a unique test patient through the UI, saves clinical notes, assigns a device if one exists and restores the previous assignment, creates/reads/deletes a test notification, saves/restores workspace settings and notification preferences, exports reports CSV, submits a support ticket and deletes the resulting notification, deletes the test patient through the UI, checks a 404 error state, logs out, and logs back in for session recovery. It redacts auth headers and does not print passwords or ID tokens.
- Local verification passed: `node --check scripts\portalMutationSmokeTest.mjs`, `node --check scripts\portalBrowserSmokeTest.mjs`, `bun run lint`, `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, and targeted `git diff --check`.
- Initial live mutation execution was blocked by browser network policy on 2026-07-05, but the 2026-07-06 follow-up below completed the live mutation E2E slice on `https://shcare.web.app`.

## 2026-07-06 - Shcare Web login and live portal E2E hardening

- The user-reported mobile login screenshot for `nguyengiabao100624@gmail.com` was traced with Firebase Admin: the account exists, is not disabled, is email-verified, uses password provider, and has platform-admin claims. That account belongs on `https://shcare-admin.web.app`; an `auth/invalid-credential` response on `https://shcare.web.app` means Firebase rejected the password/credential before portal role checks.
- `smart-health-web/src/lib/firebase-client.ts` now maps Firebase Auth failures to Vietnamese user-facing messages instead of exposing raw `Firebase: Error (auth/...)`. Invalid credentials also tell platform-admin users to use `shcare-admin.web.app` or reset the password.
- `LoginPage.tsx` now exposes the login error as `#login-error[role="alert"]` with `aria-live`, so the error is accessible and directly testable.
- `PortalLayout.tsx` no longer passes a fresh `state` object on unauthenticated portal redirects. This removed the live React "Maximum update depth exceeded" console failure seen when deep-linking to a protected portal route.
- `WorkspaceSettings.tsx` no longer shows the unsupported `representative` input. The live backend does not persist that field; the UI now only edits workspace fields returned/persisted by the API (`name`, `address`, `phone`, `email`, `website`).
- `portalMutationSmokeTest.mjs` now creates notifications for the current user id so read/delete visibility matches the portal permission model, verifies a persisted workspace `website` update with restore, and treats only intentionally expected 404 checks as expected.
- Final Shcare Web Firebase Hosting release: site `shcare`, version `projects/162993928259/sites/shcare/versions/f9ca61aea825f375`, live release `projects/162993928259/sites/shcare/channels/live/releases/1783335390544000`.
- Verified on the final live release: targeted ESLint, `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:portal-production`, `bun run smoke:portal-browser`, invalid-credential browser UI smoke, Firebase Admin audit for `nguyengiabao100624@gmail.com`, and `bun run smoke:portal-mutation` all passed. The final mutation smoke created/updated/deleted patient data, assigned/restored a device, created/read/deleted a notification, saved/restored workspace settings and notification preferences, exported CSV, submitted/cleaned a support ticket, verified expected 404 states, logged out, and logged back in.

## 2026-07-06 - Portal/admin device and needs-info sync follow-up

- Shcare Portal now has `/portal/devices/claim` and a `Them thiet bi` CTA on the devices page. Workspace users with device view capability can self-claim a provisioned same-workspace device with a valid claim code; device managers can still create/pair directly. Backend `/devices/pair` keeps arbitrary no-code device creation behind device-management capability.
- `ApprovalPendingPage.tsx` now handles admin `needs_info` / `info_requested` status on `/can-bo-sung` with a real resubmit form for requested profile fields and optional document upload. It posts the updated role request, uploads the selected document, refreshes `/api/me`, and returns the user to the pending page.
- Web Admin already had the Devices route/page/dialogs, but the Platform Admin sidebar did not expose it. `ADMIN_MENU_ITEMS` now includes `/devices` for `platform.devices.view` / `platform.devices.manage`, so a full-right admin can reach device inventory and add/activate/manage devices.
- The final Shcare Portal theme layer now forces account/notification `.clinical-popover` surfaces to use backdrop blur plus stronger translucent backgrounds in both light and dark mode; `portalBrowserSmokeTest.mjs` now fails if the popover lacks `blur(...)`.
- Smoke/tooling updates: `smoke:workspace-access` seeds a claimable device and verifies a doctor can claim it with a code while no-code creation is denied; `portalBrowserSmokeTest.mjs` visits `/portal/devices/claim`; `portalMutationSmokeTest.mjs` provisions, claims, and cleans up a device through the portal claim route.
- Local verification passed after this follow-up: backend `npm.cmd run check` and `npm.cmd run smoke:workspace-access`; Shcare Web `bun run lint`, `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, `node --check` for both portal smoke scripts, and local Playwright claim/blur smoke against a demo backend/web dev server; Web Admin `npm.cmd run lint` and `npm.cmd run build:firebase:admin`; Android `.\gradlew.bat :app:compileDebugKotlin`.

## 2026-07-07 - Backend tenant hardening push and live deploy rerun

- Pushed commit `88877ad5` (`Ship Smart Health tenant hardening and live smokes`) to `origin/main`, so Render backend auto-deploys from the GitHub main branch. The backend health endpoint returned HTTP 200 after the push.
- Backend source in that commit hardens `/api/v1/me` workspace switching, scan row filtering, notification direct-user targeting, device transfer target validation, and export organization scoping; the local pre-push matrix already passed backend `check`, `test`, workspace/repository/storage/notification smokes, Shcare Web lint/typecheck/build, Web Admin lint/build, and Android compile.
- Deployed Shcare Web Firebase Hosting site `shcare` version `projects/162993928259/sites/shcare/versions/fab6a2ad97c63420`, release `projects/162993928259/sites/shcare/channels/live/releases/1783411275583000`.
- Deployed Web Admin Firebase Hosting site `shcare-admin` version `projects/162993928259/sites/shcare-admin/versions/ce26044bb3730062`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783411298455000`.
- Live post-deploy verification passed: `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`, `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` run `portal-mutation-mrad4yzw`, and `npm.cmd run smoke:admin-mutation` run `admin-mutation-mrad8n0r`.
- Non-deploy local artifacts intentionally remain untracked: root `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, CV/report files, report evidence, debug PNG, `smart-health-embedded/.github`, `smart-health-embedded/report-assets`, and `smart-health-embedded/tools`.

## 2026-07-07 - Live portal/admin sync and form hardening

- Deployed the 2026-07-06 portal/admin follow-up to Firebase Hosting. This earlier same-day release was superseded by the backend-hardening deploy above: Shcare Web site `shcare`, version `projects/162993928259/sites/shcare/versions/04e18dde26eedb19`, release `projects/162993928259/sites/shcare/channels/live/releases/1783360712235000`; Web Admin site `shcare-admin`, version `projects/162993928259/sites/shcare-admin/versions/4e84a69f69a916e2`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783360744436000`.
- Added `method="post"` to React forms across Shcare Web and Web Admin so a pre-hydration/native form submit cannot put email/password fields into the URL query string. Browser smoke confirmed the admin no-JS form submits without credential query leakage; the portal no-JS page does not render a native login form; hydrated admin and portal logins both reach the Devices pages.
- Final live verification passed after deploy: `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:portal-production`, `npm.cmd run smoke:production-roles`, `bun run smoke:portal-browser`, `bun run smoke:portal-mutation`, and the custom no-query-leak/admin+portal auth Playwright smoke. The mutation smoke covered patient create/update/delete, device provision/claim/assign/restore/cleanup, notification create/read/delete, workspace settings save/restore, notification preference save/restore, report export, support ticket submit/cleanup, expected 404, logout, and session recovery.
- Source/build matrix also passed: backend `check`, `test`, `smoke:workspace-access`, `smoke:repositories`, `smoke:notification-push`, and `smoke:storage`; Shcare Web `lint`, `tsc --noEmit`, and `build:firebase`; Web Admin `lint` and `build:firebase:admin`; Android `:app:compileDebugKotlin` and release `:app:assembleRelease -PSMART_HEALTH_BASE_URL=https://smart-health-api-xj0a.onrender.com`; MSM261 PlatformIO normal and OTA builds.
- Local `npm.cmd run check:production` still reports `BLOCKED` only because this local PowerShell process is missing Render/Supabase/S3/PHI/email/MQTT production envs and falls back to demo/json/local settings. Android release still emits Compose `Icons.Filled.*` deprecation warnings; replacing them with `AutoMirrored` was not compatible with the current Compose dependency set. Physical ESP32-S3 heartbeat/audio/OTA validation still needs connected hardware.

## 2026-07-07 - Web Admin mutation smoke coverage

- Added `smart-health-admin\thiết kế giao diện\scripts\adminMutationSmokeTest.mjs` plus `npm.cmd run smoke:admin-mutation`. The smoke uses Playwright to sign into live `https://shcare-admin.web.app` with the platform account generated by backend `smoke:production-roles`, waits for the Firebase/backend token, hard-navigates into the admin shell, then exercises live Render mutations through authenticated browser `fetch`.
- Coverage includes `/me`, settings patch/restore, platform clinic/workspace create/patch/delete, package create/patch/assign/delete, patient create/patch/delete, device provision/patch/delete, notification create/read/delete, storage bucket create/delete, and route checks for overview, devices, patients, clinics, packages, notifications, storage, settings, admin accounts, and audit log.
- Verified from this workspace: `node --check scripts\adminMutationSmokeTest.mjs`, Web Admin `npm.cmd run lint`, backend `npm.cmd run check`, backend `npm.cmd run smoke:production-roles`, and live Web Admin `npm.cmd run smoke:admin-mutation` all passed. Latest live run id `admin-mutation-mrad8n0r` restored settings and cleaned notification, storage bucket, device, patient, package, and workspace with HTTP 200 cleanup responses.

## 2026-07-04 - Project cleanup and navigation index

- Added `docs/SMART_HEALTH_PROJECT_INDEX.md` as the one-page project map for active source folders, live URLs, handoff order, safe cleanup rules, and focused smoke commands.
- Root `.gitignore` now ignores local agent/tooling caches: `.config/`, `.impeccable/`, `.npm-cache/`, and `codex-telegram-bridge/`.
- README now points new readers to the project index before the detailed handoff files.
- `SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` was cleaned so it no longer starts with an old raw instruction about installing skills; it now points to the current global skill storage policy.

## 2026-07-05 - Shcare Web build env and Admin export bundle cleanup

- `smart-health-web` production Firebase builds now load production web env through `scripts/production-env.js` before validation/build. Effective order: explicit process env, `SHCARE_WEB_ENV_FILE`, `smart-health-web\.env.production.local`, `smart-health-web\.env.production`, then the existing Web Admin `.env.production` fallback. The helper sets safe non-secret defaults for production auth, Render API base, and `https://shcare.web.app` without printing secret values.
- `smart-health-web\vite.firebase.config.ts` calls that env helper before Vite config is resolved. Local verification passed: `bun run lint`, `bunx tsc --noEmit --pretty false`, and `bun run build:firebase`. Generated `dist-firebase` contains the Render API base once and no `localhost:3000` API fallback.
- Web Admin PDF/export no longer ships the 2 MB Roboto base64 string inside TypeScript bundles. The font is now `smart-health-admin\thiết kế giao diện\public\fonts\roboto-regular.ttf`, and `src/lib/export-utils.ts` lazy-loads it only when PDF export runs.
- Web Admin Fast Refresh warnings were cleaned by splitting hooks, context helpers, pagination utilities, motion presets, UI variants, and router error UI into non-component helper modules. Verified: `npm.cmd run lint` passed warning-free, `npm.cmd run build` passed, and `npm.cmd run build:firebase:admin` passed with `dist-firebase\client\fonts\roboto-regular.ttf` present. The remaining TanStack messages during prerender are dependency unused-import warnings from `node_modules`, not source lint failures.
- `scripts/publicDeploymentSmokeTest.js` now defaults request timeout to 60s, supports `SMOKE_REQUEST_TIMEOUT_MS`, and reports the timed-out URL. This avoids false failures when the Render backend cold-starts slower than the old 15s timeout.
- Deployed Firebase Hosting from verified local builds on 2026-07-05: `shcare.web.app` version `projects/162993928259/sites/shcare/versions/82dea8d245b9eee7` and `shcare-admin.web.app` version `projects/162993928259/sites/shcare-admin/versions/eb467019efffe1b4`.
- Live browser smoke caught a Shcare Portal deep-link regression where unauthenticated `/portal/patients` rendered `No QueryClient set` instead of redirecting to login. `smart-health-web/src/app/App.tsx` now wraps the React Router SPA with `QueryClientProvider`; cache-bypassed Chrome smoke confirmed `/portal/patients` redirects to `/login` with no console warnings.
- Additional cache-bypassed Chrome smoke confirmed unauthenticated Shcare Portal deep links `/portal/devices`, `/portal/records/review`, and `/portal/settings` redirect to `/login` without console warnings; Web Admin `/admin-actions` redirects to `/login` without console warnings.
- Authenticated Chrome smoke on the live `shcare.web.app` checked workspace-admin login plus dashboard, patients, devices, records, settings, reports, and notifications routes; doctor login plus dashboard, patients, and records routes; no runtime console warn/error appeared. A Chrome form-field issue found on portal filter/forms was fixed by adding stable `id`/`name` attributes across portal inputs/selects/textareas and redeployed in version `82dea8d245b9eee7`.
- Post-deploy verification passed: backend `check`, `test`, `smoke:workspace-access`, `smoke:repositories`, `smoke:notification-push`, `smoke:storage`, `smoke:api-production`, `smoke:public-deployment`, and credentialed `smoke:production-roles`; Shcare Web `bun run build:firebase`; Web Admin `lint`/`build`/`build:firebase:admin`; Android `:app:compileDebugKotlin` and `:app:assembleDebug -PSMART_HEALTH_BASE_URL=https://smart-health-api-xj0a.onrender.com`; MSM261 PlatformIO normal and OTA builds.
- Still blocked by external resources, not source code: local shell lacks `DATABASE_URL`, Brevo, MQTT, and S3/R2 envs for real provider smoke; `platformio device list` only showed COM5/COM6 Bluetooth serial links, so physical ESP32-S3 flash/heartbeat/audio/OTA validation still needs the board connected and provisioned.

## 2026-07-04 - Codex Telegram bridge account-notification fix

- Local ignored tool `codex-telegram-bridge` now sends a Telegram account notification on the first detected Codex account heartbeat as well as later account-hash changes. This fixes the case where changing Codex accounts while the bridge had no prior notified marker silently recorded the new account without notifying Telegram.
- The bridge now reads the latest `telegram_account_current` marker correctly from newest-first events instead of using the oldest marker from the recent event window.
- Verified in `D:\Study\KLTN\codex-telegram-bridge`: `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` passed. If the current Codex task is running through Telegram, restart the bridge after the task completes so the running `dist` process loads the rebuilt code.
- Cloudflare Quick Tunnel was not fixed in this local pass: `data\cloudflared.err.log` showed `connectex: An attempt was made to access a socket in a way forbidden by its access permissions` when requesting `api.trycloudflare.com/tunnel`.

## 2026-07-04 - Codex Telegram bridge full-access and remote choices

- Local ignored tool `codex-telegram-bridge` now has a gated `full` job profile for new Codex tasks. Set `CODEX_BRIDGE_ALLOW_FULL_ACCESS=true` in `codex-telegram-bridge\.env`, restart server and worker, then use `Chạy toàn quyền` from Telegram/dashboard. Worker runs `codex exec -s danger-full-access --ask-for-approval never`; it still does not use `--dangerously-bypass-approvals-and-sandbox`.
- Full-access is intentionally fail-closed: server rejects it when the env opt-in is off, and worker refuses `full` resume jobs because current `codex exec resume` does not expose an equivalent safe sandbox flag.
- Telegram choice buttons now apply to final answers from both Telegram-launched jobs and existing Codex IDE sessions. Dashboard logs also show a choice panel for selected jobs when the final assistant message contains A/B/C/D or 1/2/3/4 options.
- Verified in `D:\Study\KLTN\codex-telegram-bridge`: `npm.cmd run typecheck` and `npm.cmd test` passed during implementation. Run `npm.cmd run build` and restart bridge after the current Telegram-launched Codex task finishes so `dist` serves the new code.

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
- `SMART_HEALTH_PROJECT_INDEX.md`: one-page navigation map for active source folders, handoff order, cleanup rules, live URLs, and focused smoke commands.
- `SMART_HEALTH_PROMPT_REQUIREMENTS_HANDOFF.md`: broad prompt ledger that prevents redoing closed slices and names the next non-repeated product-hardening slice.
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
- 2026-06-11/22 tooling update, refreshed 2026-07-10: Matt Pocock skills were first installed project-locally, then migrated to the user-wide `C:\Users\baobe\.agents\skills` directory on 2026-06-22. On 2026-07-10 the full latest `mattpocock/skills` set was refreshed globally, including `setup-matt-pocock-skills`, `wayfinder`, `to-spec`, and `to-tickets`. The project-local `.agents` tree and `skills-lock.json` were removed. Do not read every installed skill by default; open only the selected skill for the current task.
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
  - UI/UX skill pool: the base `gpt-taste` skill is always paired with `impeccable`; every materially applicable UI/UX skill should be added for interface work, including specialized Taste skills, frontend implementation/testing, Figma/design-source, platform UI, emulator/browser QA, UI performance, and visual-asset skills. `design-taste-frontend` and legacy v1 remain skipped because they duplicate the Codex-specific base skill.
  - `context-budget` and `strategic-compact`: selected from `affaan-m/ECC` for context/token budgeting; the full ECC skill pack was not installed because it overlaps existing tools.
  - The assistant should infer and select the relevant installed skill/tool from the registry and `SMART_HEALTH_AGENT_SKILLS_GUIDE.md`; the user does not need to remember exact skill names.
  - Full current `mattpocock/skills` set lives user-wide under `C:\Users\baobe\.agents\skills`; use `ask-matt`, `setup-matt-pocock-skills`, `wayfinder`, `to-spec`, `to-tickets`, `implement`, `tdd`, `code-review`, `diagnosing-bugs`, `codebase-design`, and `domain-modeling` when the task calls for shaping/spec/tickets/TDD/review/deep-module design.
  - `impeccable` v3.8.0: always combined with `gpt-taste` for future web/admin/Android interface work, then expanded with all applicable UI/UX skills from the global registry. Impeccable owns UX/accessibility/production quality; Taste owns visual direction. Existing Smart Health tokens and product/native conventions override incompatible generic marketing rules.
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
- Firebase production build uses `VITE_AUTH_MODE=production`, `VITE_SMART_HEALTH_API_BASE_URL=https://smart-health-api-xj0a.onrender.com/api`, and `VITE_PUBLIC_SITE_URL=https://shcare.web.app`. Current Shcare Web live assets from the 2026-07-07 deploy are `index-BYbKHHuF.css` and `index-DUdxUBDE.js`; route chunks are split separately.
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

## 2026-07-07 Codex Telegram Bridge Account Sync And Parallel Jobs

- Local `D:\Study\KLTN\codex-telegram-bridge` now requests a lightweight Codex quota probe whenever a Codex profile is checked, selected for a job, first seen by the worker, or changed by account hash.
- Switching/using a Codex account now marks that account as the bridge default by updating `codex_accounts.is_default` and `run_config.default_account_id`, so dashboard/config reflect the active account instead of stale exhausted-account data.
- Worker runtime now supports multiple active jobs with `WORKER_CONCURRENCY` (default `2`, clamped `1-4`). Job claiming still prevents two resume jobs for the same `target_session_id` from running at the same time.
- Quota probes run as `codex exec --ephemeral --ignore-rules --json -s read-only` against the target `CODEX_HOME`, store `token_count` usage with source `quota_probe`, and do not create normal session files.
- 2026-07-07 follow-up tightened the account-default path: overview usage is now scoped to the active/default account, default selection immediately queues a quota probe when usage is missing, runtime quota fallback promotes the fallback account to default, and quota probe claiming prioritizes the default account.
- Verification in `codex-telegram-bridge` returned exit code 0 for `npm run windows:check`, `npm run typecheck`, targeted DB/app/runtime Vitest, full `npm test`, and `npm run build`.
- Real smoke status is still IN PROGRESS, not finished. A copied live DB smoke on port `8798` verified manual account switching, fallback from exhausted `.codex` to another profile, dashboard/default consistency, and default persistence after server restart. Real quota-update proof is blocked because all tested real Codex profiles either returned "workspace is out of credits" / "usage limit" or did not emit a `token_count` event. The live bridge process on port `8788` was not restarted while a Telegram-launched Codex job was active.

## 2026-07-07 Codex Telegram Bridge Completion Notifications

- Local `D:\Study\KLTN\codex-telegram-bridge` now renders rich terminal notifications for Codex jobs and standalone sessions. Job/session completion messages include task name, request summary, Session ID, Task ID when available, start time, end time, total duration, final status (`Success`, `Failed`, or `Cancelled`), result summary, explicit file/output references when detected, and the account/profile/CODEX_HOME used.
- `job_done` is no longer enough to send `Success`: the bridge now requires a final assistant message first. If Codex reports done but the bridge cannot find the final answer, the job is marked `failed` and Telegram receives a `Failed` notification explaining that no final result was confirmed.
- `job_failed` and `job_canceled` use the same terminal-notification path, so failures/cancellations identify the task and reason instead of looking like successful completion.
- Anti-spam markers now prevent duplicate running and terminal notifications: `telegram_job_running_sent`, `telegram_job_terminal_sent`, and content-hash session final markers. Replayed terminal events do not produce repeated completion messages.
- Verification in `codex-telegram-bridge` passed: `npm.cmd run windows:check`, `npm.cmd run typecheck`, `npx.cmd vitest run tests/app.test.ts`, `npx.cmd vitest run tests/workerRuntime.test.ts tests/codexRunner.test.ts`, full `npm.cmd test`, and `npm.cmd run build`.
- The multi-job/multi-session notification smoke is covered by Fastify server injection through the real bridge API/DB/Telegram-client path. It verifies two concurrent Telegram jobs plus two concurrent standalone sessions, duplicate replay suppression, failed done-without-final behavior, and repeated failed/cancelled status dedupe without consuming real Codex quota.
- Live bridge restart is still an ops step: restart the local bridge only after active Telegram-launched Codex jobs finish so the rebuilt `dist` loads without interrupting a running task.

## 2026-07-17 Shcare Phase 3 Identity/Profile Status

- Phase 3 is closed for source/build/local/simulated proof. The frozen backend identity/security snapshot has no known open P0/P1 after integration and full local regression. Do not confuse this with live PostgreSQL/Firebase, Android runtime or production-release proof.
- Shcare Web account/profile/workspace/session UX is source/build verified: session revoke uses stable retry idempotency and waits for `revokedAt`; 31/31 Auth/account tests, 14/14 contract tests, TypeScript, ESLint and production build passed. The current slice has no new live provider mutation proof.
- Android Profile/Family/Workspace/Account Security now use native feature ViewModels, backend-confirmed outcomes, stable mutation idempotency and explicit loading/empty/error/offline/permission states. Session revoke requires matching `revokedAt` confirmation. Full Android verification passed 108/108 unit tests across 19 suites, `assembleDebug`, and `lintDebug` with zero Error/Fatal.
- Android pending-registration PII is encrypted with Android Keystore AES-256-GCM and excluded from backup. No attached device is available, so Keystore process-death, TalkBack, Firebase/FCM and runtime UI proof remain `BLOCKED`.
- Backend now uses a three-stage managed-admin activation saga and fail-closed importer/runtime authority checks. Integrated gates passed: `check`, base smoke, managed-admin, identity-migration, repositories, workspace-access, 2FA, Firebase Admin compatibility and KLT contract. The 24-file backup/hash manifest is recorded in the rebuild ledger.
- Remaining identity proof is external: live PostgreSQL/Supabase migration/row-lock/concurrency, real Firebase provider mutation, Android device/emulator and production promotion. Bundled JSON tenant remediation is also still `BLOCKED`.
- Continue with Phase 4 device provisioning/command/OTA source work. Canonical mobile pairing remains QR/manual plus secure Wi-Fi provisioning and authenticated WSS presence; BLE remains out of scope without a same-release GATT/security/hardware proof.
- The durable evidence record is `docs/SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`; keep proof classes separate and never replace live/provider/device evidence with source/build results.

## 2026-07-17 Shcare Phase 4 Device Provision/Inventory Continuation

- Current phase: `Phase 4 IN_PROGRESS`. Backend provision QR now requires `Idempotency-Key`, uses an atomic audited device + claim mutation, and replays without storing raw claim code. Admin Add Device sends the same stable key and cannot be dismissed while pending.
- Inventory metadata is synchronized across Admin/API/JSON/PostgreSQL/importer. Migration order is 024 then 025; an empty purchase date is nullable.
- Fresh local proof: backend device-security 31/31 plus check/base/repository/workspace/identity/KLT smokes; Admin contracts 28/28, typecheck, lint/build; firmware three PlatformIO builds and shared fixtures. Native C++ test execution is blocked by missing host `gcc/g++`; no Android target or ESP32 board is attached.
- Open before Phase 4 closure: secure setup AP physical gesture/PoP/expiry/CSRF, two-phase secret rotation, SQL-authoritative claim lifecycle, complete firmware telemetry/ACK/durable dedupe, and real Postgres/provider/browser/emulator/hardware proof.

## 2026-07-17 Phase 4 secure setup and telemetry checkpoint

- Setup recovery AP source hardening is now present: factory-state/physical-gesture gate, random CSRF constant-time check, restrictive headers, ten-minute TTL, and station-loop factory reset. The AP remains open Wi-Fi until the QR/App/firmware contract can carry a per-device PoP/WPA2 credential.
- Telemetry is allowlisted and synchronized end-to-end: firmware → authenticated WSS → backend migration 026 → Web/Admin/Android models. The contract covers uptime, reset reason, free heap, I2S health, packet counters, last command and OTA state without accepting secret-shaped fields.
- Fresh verification: backend device-security 33/33, Web lint/build, Admin 28/28 plus typecheck/lint/build, Android compile/unit test, and firmware builds plus embedded test-target compilation. Native firmware execution, physical board, provider, browser mutation and Android runtime proof remain blocked.
- Continue Phase 4 only: two-phase credential rotation with device ACK/overlap, SQL-authoritative claim lifecycle, durable command dedupe and telemetry UI; keep Web and Android UI implementations independent.

## 2026-07-18 Phase 4 device source/local closure and external gates

- Phase 4 device implementation is closed for source/build/local/simulated proof, not for production, provider, emulator or hardware proof. Backend device events from WSS and MQTT are serialized per `deviceId`, eliminating the reproduced ACK/applying race; credential rotation only promotes the exact confirmed candidate and JSON/PostgreSQL repository paths share the same invariant.
- Secure provisioning is synchronized without copying UI between platforms. Platform Admin renders and downloads the canonical one-time QR artifact (`deviceId`, exact claim code, expiry and WPA2 setup-AP PoP), never infers an SSID from a device suffix, and fails closed on a drifted response. Portal and Android preserve identifier case, reuse one idempotency key for the same intent and separate accepted/awaiting-online from authenticated WSS online confirmation.
- Admin Activate now blocks rapid double-submit and every dismissal path while in flight, preserves exact identifiers and keeps ambiguous network retries on the same idempotency key. Admin OTA exposes the canonical lifecycle and treats command `applied` only as rebooting; success requires matching OTA command/version plus backend `confirmed` after device reconnect.
- Fresh gates: backend device-security 38/38, ownership repository 30/30, setup security 3/3 and concurrency 2/2 plus check/base/repository/workspace/identity/KLT smokes; Web claim 9/9, Auth 52/52, lint/build; Admin contracts 46/46, TypeScript, lint and client/SSR build; Android focused pairing 21/21 and full unit 140/140 plus compile/assemble/lint.
- Current Android debug APK SHA-256 is `584946A4BC26F3432668D69F903A004AD3926163A57CE28C3A0E8695F0CFE58F`. The production firmware SHA-256 after rebuilding after the embedded-test compile is `27EE44D3CC1C827318EE22C9565302848A3BB078DE7DA86EA25D440235DB6E80`; development is `7175189ADC0A747212525EFC14465E728A6E233CBA9B1039D1A9CE71D8B2820F`; OTA-build profile is `0F5C4D4A96182D2D1F2205D58C99880DFD91492C6B7AE68FF3CA4E58E7C7748B`.
- External gates remain open: live PostgreSQL migration/row locking, Firebase/provider mutation, authenticated browser mutation, Android runtime/TalkBack, serial/I2S/secure-WSS/OTA rollback and actual 16 MB flash/partition behavior. Native firmware tests are blocked by missing `gcc/g++`; `adb devices -l` is empty; the board profile still reports 8 MB although the configured CSV ends at 16 MiB.
- Admin dependency audit now has zero critical findings after pinning `websocket-driver@0.7.5`, but seven high findings remain, including unpatched `xlsx`; production promotion stays blocked until the Admin/export dependency slice resolves or replaces them.
- Next active work is Phase 5. The audit already found P0 clinical-integrity gaps in workspace-scoping of review/alert/scan caches, Live metrics/status/frame identity, and fake/false-success Admin AI presentation. Fix those before expanding review/audio UI.
- Backend/firmware trace confirms device→backend v2 binding and source isolation are present, but the scan session lifecycle is not yet trustworthy: `activeRecording` is global, start/stop commands are not persisted in the command ledger, disconnect does not interrupt the bound scan, processing can duplicate AI rows and upload chunks append without idempotent offset/hash semantics. Phase 5A begins with scan/command persistence, ACK-or-first-frame recording confirmation, per-device session registry and disconnect cleanup tests.

## 2026-07-18 Phase 5 scan/audio/review/alert source-local closure

- Phase 5 is now closed at source/build/local/simulated level. Workspace PHI caches and live source identity are isolated; review/alert state uses real tenant/capability/audit contracts; Admin and Android AI no longer manufacture clinical data or successful outcomes.
- The seven audited upload/processing P1s are covered: completion lease recovery, durable queue/reprocess generation, orphan cleanup and post-completion replay, deterministic atomic worker writes, composite tenant scope, bounded upload limits, and terminal failure restricted to the matching generation.
- Backend gates passed, including upload 15/15, worker 6/6, clinical 8/8, device 41/41, protocol 4/4 and AI 5/5. Web passed 24/24 contracts, 84/84 Auth tests, lint/type/Firebase build and desktop/mobile browser checks. Admin passed 59/59 contracts plus lint/type/client+SSR build. Android passed 158/158 tests plus assemble/lint/debug-instrumentation compile; APK SHA-256 is `E19F5D525AECB53295D56DCC99B62352D214A102A431AC41A5273E3BD0D4180B`.
- No release/deploy was performed. Live PostgreSQL/Redis/provider, Android emulator/device/TalkBack/FCM and ESP32-S3 serial/I2S/WSS/OTA rollback remain `BLOCKED`; source/build proof is not a substitute.
- Continue with Phase 6–7 by selecting the smallest concrete gap from appointment/consent/notification/staff and Admin operation truthfulness. Do not reopen closed Phase 5 work without regression evidence, and keep Web/Android UI implementations independent.

## 2026-07-19 Phase 6–7 current handoff

- Consent/settings/membership plus Packages and Platform Storage are closed for source/build/local/simulated proof. Migrations 037/038, JSON/PostgreSQL repositories, required idempotency, transactional audit and exact replay are implemented.
- Admin Storage no longer renders fake quota/security/history/progress, and signed share requires a real S3 HTTPS URL. Local storage reports provider unavailable. Admin gates are 91/91 plus type/lint/build; backend package 3/3 and storage 6/6 plus integrated smokes are green.
- No live migration, S3 call, authenticated browser mutation or deploy was run. Bundled JSON tenant remediation remains blocked. Android/firmware impact for Packages/Storage is `N/A`.
- Continue Phase 6–7 by auditing the smallest remaining Admin operation. Keep the progress strip visible and preserve the separate Web/Admin/Android UI contracts.

## 2026-07-19 Phase 6–7 staff invitation checkpoint

- Staff onboarding is canonical through migration 039 and JSON/PostgreSQL repositories: invitation list/create/resend/revoke/accept, six workspace roles, tenant/RBAC, stable idempotency, transaction audit and token-hash-only storage. Provider delivery truth is explicit and replay never exposes the one-time link again.
- Admin Doctors and Portal Staff use separate UI implementations. Web Auth owns `/staff-invitations/accept` with identity-only login, 2FA, signup/email verification, exact response validation and membership refresh before Portal access.
- Local gates are green: backend staff 7/7 plus integrated smokes; Admin 103/103 plus type/lint/build; Web 43/43 contracts, 91/91 Auth, type/lint/build and 9/9 responsive/theme Auth browser checks.
- No live migration/provider/inbox/authenticated production mutation/deploy proof exists. Firebase Admin/email credentials and bundled JSON tenant remediation remain blockers. Android has no copied Web UI and firmware is `N/A`.
- Active source slice is now Clinics/Workspace lifecycle: fix PostgreSQL delete resurrection and the dead approval transition before broader Admin polish.

## 2026-07-23 Phase 6–7 Clinics/Workspace checkpoint

- Clinics/Workspace lifecycle is source/local closed through additive migration 040, JSON/PostgreSQL repository parity and OpenAPI. Create/edit/transition/archive, optimistic versioning, archive tombstones, idempotency and audit are canonical; owner approval/transfer no longer uses a dead local transition.
- A same-database restart regression proves an archived default clinic cannot return through seed/catalog hydration or accept a new doctor role request. The bundled JSON database still has unrelated tenant remediation marked `BLOCKED` before import.
- Platform Admin Clinics and its theme are independently implemented for dense desktop/tablet operation. Web Auth keeps its own responsive UI and now preserves `system` during pre-paint. Android remains native and does not copy either interface.
- Current proof: backend lifecycle 7/7 plus integrated gates and OpenAPI 53 paths/38 schemas; Admin 122/122, type/lint/build/Firebase build and Clinics browser 27/27; Web 44/44 contracts, 94/94 Auth, type/lint/build/Firebase build and Auth browser 135/135.
- No live migration/provider/deploy proof exists. Next active source work is Phase 6–7C: inspect the ledger and close the smallest remaining real operation or fake/local-only state, preserving cross-surface contract parity and separate UI/UX.

## 2026-07-23 Phase 6–7C Notifications checkpoint

- Notification campaigns are source/local closed through migration 041, JSON/PostgreSQL repositories, OpenAPI and strict Admin contracts. Audience is workspace/role/users; in-app/email/push outcomes remain independent; idempotency, tenant scope and audit are transaction-bound.
- Admin Notifications has its own responsive management UX and passed the authenticated 36/36 browser matrix with a real campaign and temporary-data cleanup. Web and Android only share the backend fields; Android remains native and has no copied Admin campaign screen. Firmware is `N/A`.
- Evidence: backend campaign 5/5 plus integrated gates and OpenAPI 54 paths/48 schemas; Admin 128/128 plus type/lint/builds; Web 94/94 Auth and 44/44 contracts plus lint/builds; Android 176/176 plus compile/assemble and APK hash recorded in the ledger.
- Live migration 041, provider delivery, Android runtime, preview/live mutation and deploy remain `BLOCKED`. Active work moves to Phase 6–7D: select and close the next remaining fake/local-only or incomplete operation from the ledger.

## 2026-07-23 Phase 6–7D1 Overview checkpoint

- Admin/Portal Overview no longer converts backend failure into zero KPIs or distributes a total count into fixed fake percentages. Backend now emits real timestamp buckets for `today|7d|30d`, explicit timezone/range metadata and stable device/processing keys; invalid filters fail closed.
- Admin uses a strict parser and separate loading/empty/error/retry/stale states. Fake trends, minimum progress and recent-alert timeline were removed; theme/reduced-motion/accessibility and 44 px interactions were verified in the real browser matrix.
- Evidence: backend overview 4/4 plus integrated gates, OpenAPI 56 paths/53 schemas; Admin 135/135 plus type/lint/builds and browser 45/45 with zero blocking findings. No live deploy was performed.
- Android and firmware are `N/A` for this aggregate desktop read surface; mobile dashboards remain independent native workflows. Active work is Phase 6–7D2, selecting the next remaining fake/dead-state or incomplete operation from the ledger.

## 2026-07-23 Phase 6–7D2A Storage checkpoint

- Platform Storage stats/files now settle independently and are strict-parsed before rendering. Partial success is preserved, refresh failure retains only explicitly stale confirmed data, the dormant zero fallback is gone, and upload fails closed until a bucket catalog is confirmed.
- Storage/Devices share the canonical file parser. Admin Storage also has semantic dark/light charts, reduced motion, accessible chart descriptions and 44 px actions.
- Evidence: focused Storage 13/13, Admin 138/138, clean type/lint, client/SSR plus Firebase builds and authenticated browser 54/54 with zero blocking findings. This is not a live deploy claim.
- Android and firmware are `N/A`; live S3/provider and preview/live mutation evidence remain `BLOCKED`. Continue Phase 6–7D2 from the next reproduced operation gap.

## 2026-07-23 Phase 6–7D2B Patient CRUD checkpoint

- Backend/Admin/Portal patient CRUD now separates canonical ID from patient code, covers structured profile/contact/clinical fields, exact retry-safe receipts, tenant/capability/audit and JSON mutation rollback/concurrency.
- Independent Admin and Portal UI passed self-starting browser matrices: Admin `63` checks plus real CRUD/cleanup; Portal Patients `9` responsive/theme checks plus idempotent create/update/delete replay and cleanup. Full backend, Admin, Web and Android source/build gates passed.
- No live deploy or Android runtime proof is claimed; firmware is `N/A`. D2C Patient Import is active because the existing page still creates rows sequentially and does not satisfy `validate → preview → commit`, batch expiry, transaction or duplicate requirements.

## 2026-07-23 Phase 6–7D2C Patient CSV Import checkpoint

- Patient Import now uses backend `validate → preview → commit`; validation never creates a patient, batches expire after 24 hours and commit rechecks duplicates before one all-or-nothing patient/audit/idempotency transaction. Migration 042 and JSON→PostgreSQL reconciliation preserve the lifecycle.
- Portal has a separate responsive import UX with complete offline/error/retry/invalid/expired/stale/permission/unsaved/confirmation/success states. Import tests passed 8/8; full backend gates passed; Web passed 57/57 contracts, 97/97 Auth/UI, type/lint/builds and browser 18/18 plus real replay/cleanup.
- This is not live PostgreSQL or deployment proof. Android and firmware are `N/A`. Continue Phase 6–7D2 by reproducing the next remaining Admin/Portal truthfulness gap instead of reopening the completed local import slice.

## 2026-07-23 Phase 6–7D2D Audit/Export checkpoint

- Audit history now has one canonical backend ledger: `/api/v1/audit-logs`, with `/api/v1/access-logs` and `/api/v1/portal/audit-log` retained as compatibility aliases. Query, action, resource, actor, date range, sort and page/limit are server-validated and applied before pagination.
- Audit metadata is recursively secret-redacted at write time. PostgreSQL keeps append-only enforcement and JSON fallback has append-only event creation; a client display mask is not the security boundary.
- Additive migration 043 stores export dataset, scope, filters, renderer version and artifact SHA-256. Renderer `shcare.export-artifact.v1` produces real backend JSON, UTF-8 CSV, OpenXML XLSX and PDF bytes; client labels or local CSV generation are not accepted as export proof.
- Capability/scope is explicit: Platform Admin may produce a platform-global audit snapshot; workspace owner/admin is limited to the active workspace; doctor clinical data is limited to active patient grants; patient data is limited to owned/dependent profiles; billing and viewer are denied. Limited actors list/download only their own jobs, while workspace managers remain tenant-bound.
- Create requires `Idempotency-Key`, exact replay reuses the same job without a duplicate `export.create` audit row, download is separately audited, and workspace scope proof revokes its temporary doctor grant through the audited cleanup workflow.
- Current backend proof is `check:audit-export`, focused audit/export `12/12`, repositories, identity migrations, workspace access, `npm.cmd test`, KLT contract and OpenAPI `0.4.0`. The bundled JSON tenant mismatch and dangling owner were remediated with explicit audit events; the identity-migration gate now passes. This supersedes older notes that called the bundled dataset itself `BLOCKED`.
- Current Platform Admin proof is TypeScript, ESLint, `151/151` contracts, build and authenticated browser `72/72` at 390/768/1440 in light/dark/system. The matrix reported zero serious/critical axe, console/request, overflow/theme or 44 px failure and verified server audit filters/metadata plus a real platform CSV Blob with SHA-256, `Content-Disposition`, UTF-8 BOM and cleanup. `xlsx` advisories are gone; 17 other `npm audit --omit=dev` advisories remain (0 critical).
- Current Portal proof is focused audit/export `8/8`, full Vitest `29` files/`105` tests, contracts `60/60`, TypeScript, ESLint, diff check and Firebase build (`2391` modules; CSS `62.64 KB` gzip). Targeted browser proof filtered 147 audit rows to 11 `q=scan` rows server-side, downloaded 11 matching CSV rows with SHA prefix `4e031d2e6faa`, observed ledger growth to 149 with create/download events, rendered real Reports counts and cleaned backend/ports/temp data/credentials. Portal accepts only workspace/assigned/personal scope and fails closed on workspace/hash/renderer drift.
- Do not record the full Portal route smoke as passed. Obsolete Radix/appointment selectors were fixed, but the third attempt ended on dev-server timeout/`ERR_CONNECTION_REFUSED` before a product assertion. This is a local harness proof gap; `bun audit` also retains 5 advisories (1 high, 3 moderate, 1 low).
- No live PostgreSQL migration 043, provider/live database, authenticated preview/live download or deployment was run. Android workspace/platform audit management is `N/A`; personal export/access-history remains a separate native Settings/Security slice. Firmware is `N/A`.

## 2026-07-23 current continuation — Phase 8C

- The complete Portal route smoke now passes locally and supersedes the stale
  timeout note above. Final Web evidence is `105/105` Auth/UI, `63/63`
  contracts, type/lint/Firebase build and browser `ok: true`; backend check and
  base smoke pass.
- Portal dependency remediation is current: Vite `7.3.6` plus compatible
  TanStack/protobufjs/brace-expansion/esbuild overrides leave `bun audit` with
  no findings, and the full test/type/lint/build plus browser regression pass
  afterward. Admin production-only audit is one low development-server
  advisory with no high or critical finding.
- Candidate builds pass for current Admin, Android (`176/176`, assemble, lint),
  brand/contracts and three firmware profiles. Android is
  `1.0.0-rc.1`/code `2`; firmware is `1.0.0`.
- Use `SMART_HEALTH_RELEASE_CANDIDATE_MANIFEST.md` as the compatibility,
  artifact-hash, exclusion, deploy and rollback source of truth.
- The verified source candidate is
  `3beac9604f2a2381697e58a5278502b6f7c5ca0e`: `512` baseline-diff files,
  `0` outside scope, `0` secret paths/high-confidence credentials and clean
  detached backend/Admin/Web-equivalent/Android-equivalent/firmware-equivalent
  source-build gates. Root LF rules and Android Kotlin-session ignore close the
  fresh Windows checkout drift found during verification.
- Active work moves to the release evidence commit/tag and then Phase 8D
  provider-backed previews. Do not stage CV/report-evidence/debug/local
  credential files.
- No preview/live, Android production signing/runtime or physical-board proof
  has occurred. Those gates remain `BLOCKED`.
