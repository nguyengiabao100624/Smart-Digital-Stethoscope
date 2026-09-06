# Smart Health - New Chat Context

Last updated: 2026-09-05

## 2026-09-05 exact MSM261S4030H0 channel mapping and fresh COM9 truth

- The ambiguity around "mic 2" is closed at the electrical/I2S boundary. MSM261S4030H0 `L/R=GND` emits Left and `L/R=VDD` emits Right; ESP32-S3 stereo RX buffers `[Left, Right]`. Firmware `slot 0` is therefore Left, and `slot 1` is Right. The enclosure side still depends on the actual harness: the module whose SEL/L/R is tied to 3.3 V is the Right/slot-1 mic.
- Both microphones use 3.3 V, common GND, CHIPEN high, shared `BCLK=GPIO11`, `WS=GPIO12` and tri-state `SD=GPIO10`. Never use 5 V or leave CHIPEN/SEL floating. The command guide now contains a power-off wiring table and bounded per-capsule tap procedure.
- A fresh 16-second COM9 capture shows Left/slot-0 RMS ranging `1,325-39,455`, but Right/slot-1 only `22-56`; the second path is still physically near silent. This is not a gain/software issue and no generic firmware was flashed over the enrolled board.
- Named Left/Right slot constants, the focused source/golden contract and the ESP32-S3 production build pass. Two-mic acceptance remains PHYSICAL BLOCKED until wiring/capsule repair and a new independent response from both slots. G4 remains PARTIAL.

## 2026-09-05 production network telemetry and WSS-only runtime closure

- Backend authentication now accepts only bounded, syntactically valid `wifiSsid`, `wifiRssi` and `ipAddress` telemetry, persists it in PostgreSQL JSONB, rehydrates the same top-level fields after reload and projects one sanitized representation to Admin/Android. Firmware reports the currently associated SSID/local IP instead of a stale saved candidate.
- Focused device security is `90/90`; repository, release-runtime `6/6`, release-security `5/5`, KLT contract, aggregate backend and full backend syntax gates pass. ESP32-S3 production and OTA targets compile; the OTA artifact SHA-256 is `90456BEEE86E2F155A3C6C6303C4C20BF2D0F91008A05D6AFB17B4EFE47AD26F`. It was not uploaded over the enrolled board.
- Render deploy `dep-dadu35ss728c73fhrns0` is LIVE on exact commit `61971072530b89b408424e64d09b7d0f206b128f`. Health returns marker `git-61971072530b`; startup logs publish only the canonical HTTPS backend and authenticated WSS App/ESP endpoints. The development UDP fallback is disabled by default in production and no UDP socket/listening line appears.
- Fresh authenticated production API proof returns the enrolled device online with non-empty Wi-Fi/IP, valid RSSI and exact top-level/nested telemetry parity. Fresh Supabase state also contains current WSS presence and network telemetry. Admin already renders these canonical fields, so the earlier “Online” plus “Chưa báo cáo WiFi/Chưa có IP” inconsistency is closed after refresh.
- Xiaomi `21081111RG` is attached and awake, while accessibility remains disabled (`enabled_accessibility_services=null`, `accessibility_enabled=0`). COM9 is present as CH343. Remaining physical/provider gates are unchanged: spoken TalkBack traversal, repair of the near-silent second microphone path, approved enrolled-device signed OTA/forced rollback, and an approved server-only AI-provider canary. Overall G4 remains **PARTIAL** until those gates have real evidence.

## 2026-09-05 migration 060, Render release and medical-record UI proof

- Supabase migration `060_pin_trigger_function_search_paths` pins the four trigger functions reported by the Security Advisor to an empty `search_path`, keeps `SECURITY INVOKER`, fully qualifies application relations and preserves all five trigger bindings. The production function owner applied the DDL; the Render Session-Pooler migration path now fails closed unless that exact hardened state already exists.
- Production dynamic regression under a hostile session `search_path` passed append-only audit rejection, missing-actor rejection, non-doctor access rejection and doctor-demotion auto-revoke/audit behavior. The transaction was rolled back and all isolated fixture counts are zero. Fresh Supabase Security Advisor output at `2026-09-05T08:48:21.109Z` has `0` WARN/ERROR and `46` INFO-only deny-by-default rows.
- Render deploys `dep-dads9767bikc73crq9d0` and `dep-dadsbh49v7es73al0c9g` exposed, respectively, an owner mismatch and an invalid `pg_catalog.coalesce` qualification. Both were fixed with regression coverage. Deploy `dep-dadtdhvavr4c73an61hg` is LIVE at backend marker `git-6e203301e599`; public deployment smoke and release-security `5/5` pass, and the deploy window has no error log.
- The medical-record share target is physically verified on Xiaomi `21081111RG`: the new Compose test passes `1/1` in dark theme at 200% font, starts collapsed, expands on the explicit 48dp target and exposes its query only after expansion. Debug APK `71774EA6A6A22DA9F9B3D5A948E08AC1F1DA58E3624552CA29557E69F87A54CE` is installed; the test package was removed and normal `MainActivity` is foreground with no fatal/DNS/TLS log.
- TalkBack is installed but disabled. MIUI rejects ADB secure-setting writes without `WRITE_SECURE_SETTINGS`, so a true spoken-focus traversal remains a manual device boundary; the failed attempt left accessibility state unchanged. Do not claim TalkBack PASS from Compose semantics alone.
- Fresh bounded COM9 telemetry shows WSS frames still advancing and healthy slot 0 (`RMS 26,983–46,211` in the captured sample), while slot 1 remains near silence (`RMS 70–110`). This isolates the remaining second-microphone acceptance gap to SEL/wiring/power/capsule/acoustic hardware; do not flash the enrolled board or amplify this noise blindly.

## 2026-09-04 fresh Xiaomi, COM9, audio and AI verification

- Continue from source commit `195169f4`. The current debug APK is SHA-256 `BD4C50BF8AB74E0BF8FB7AA1D84D0DAEEB19700D77BCBA733B93E2B206AB7BDA`; Xiaomi `21081111RG` accepts the production package and the instrumentation package was removed after verification.
- Fresh physical Android instrumentation is PASS: `AIAssistantScreenTest` `3/3` proves patient/doctor composer parity at 200% font, explicit archive confirmation, a live right-entering 28-bar waveform and stop-to-review transcription that does not send before the user presses Send. Doctor dashboard, scan and record-detail instrumentation is also PASS `9/9`, including 48dp actions, offline/readiness states, waveform semantics and view-only authority.
- Fresh source/build gates are PASS: backend aggregate check plus AI `12/12`, audio-v2 `4/4` and audio worker `6/6`; Admin contracts `209/209`, lint and 17-route Firebase build; doctor-focused Portal contracts `141/141`, lint and Firebase build; Android unit tests; firmware source contracts `5/5` and ESP32-S3 production build (`RAM 17.0%`, app-slot flash `18.8%`, `1,184,477` bytes).
- Live surfaces answer successfully. Admin and Portal Firebase Hosting return `200`. Render had one free-tier cold request timeout, then returned `200` in `0.512 s`; its implementation marker remains `git-329c998160ff`, which is expected because the latest source commit changes Android/docs rather than the backend.
- COM9 is physically present as CH343. Read-only reset/serial proof shows ESP32-S3 revision 0.2, ESPTouch V2 KDF self-test PASS, BLE disabled, I2S initialized, bounded reconnect and heart/lung filter profiles. The saved SSID `Louisnguyen` currently fails with Wi-Fi reason `201 NO_AP_FOUND`, therefore WSS and UDP remain `0` and the phone cannot receive live auscultation audio.
- A fresh 180 Hz speaker stimulus across 36 telemetry windows left both physical mic slots at `RMS=1`, `peak=1`. Older board evidence had RMS in the thousands, so clear heart/lung capture is **not** credited. Before flashing or tuning software, inspect board power/contact/wiring and the two MSM261S4030H0 signal paths; the current pin/format configuration matches the previously working image.
- Remaining real-runtime boundaries are narrow and explicit: authenticate a patient and doctor in the App; provision an available 2.4 GHz Wi-Fi through the secure field; restore the matching enrolled device identity/trust; repair the physical mic signal; and configure an approved server-only AI provider. Do not pass credentials through ADB, source or logs, and do not flash a generic artifact over an enrolled board.

## 2026-09-04 AI physical UI closure (supersedes the sleeping-device attempt below)

- The debug-only Compose host now sets show-when-locked, turn-screen-on and keep-screen-on during `onCreate`, before the test Activity can be suspended by MIUI. It does not affect the production Activity and does not bypass a secure user login.
- Fresh Xiaomi `21081111RG` instrumentation passes `2/2`: the shared patient/doctor composer remains usable in dark theme at 200% font, and History -> Archive displays an explicit confirmation before the server-backed archive action. The test package was removed; normal App APK SHA-256 `0CA31CF520DFF1A1DED3045B3194476A900115728B515105957EBF87EF5C915D` is installed and `MainActivity` is awake in foreground. AndroidTest SHA-256 is `A92353B6D288AD8CA70E97D6F76F4CEBF2653F5DEB692BBF3CF2A9ED9AC13CF4`.
- Platform Admin remains green with `209/209` contracts, lint and the 17-route Firebase production build. This checkpoint does not change the already-live Admin artifact because no Admin source changed.
- Authenticated patient/doctor STT, real file selection, provider reply and WSS heart/lung listening remain separate runtime gates. The normal App is currently at login after reinstall; no credential was extracted or injected.

## 2026-09-04 AI conversation-management and current-device checkpoint

- Android AI history is now complete for the active-history contract: a user can select a server-backed conversation, see attachments that were bound to each confirmed message, and archive a conversation through an explicit confirmation dialog. Archiving uses the existing tenant/user-scoped backend endpoint, removes only the server-confirmed item, and loads the next confirmed conversation without an optimistic local delete.
- Fresh Android evidence on the concurrent AGP `9.4.0` / Gradle `9.7.1` worktree is PASS: focused `AiChatViewModelTest`, full `testDebugUnitTest`, `lintDebug`, `assembleDebug`, and `assembleDebugAndroidTest`. The installed APK is `48,729,342` bytes, SHA-256 `97B536E63832930826423B49E81D201AA491870B90D5812410D42FB9F32C612B`; AndroidTest SHA-256 is `A0F9603434B3934FE652AA26D5260400360AB3648B4A79E1FDDFB8948E761677`.
- Xiaomi `21081111RG` accepted both APKs, but it entered `Asleep` during the four-minute build. MIUI denied shell input injection, so the fresh Compose run correctly remains **BLOCKED BY DEVICE STATE**, not PASS and not an app crash; logcat shows the test Activity sleeping with no fatal exception. The test package was removed, the normal APK was reinstalled and its `MainActivity` was started. The App still requires a real user login before authenticated history, STT, attachment-picker and provider-response HIL can be credited.
- Backend AI contracts remain `12/12` and audio-v2 remains `4/4`. Firmware production still builds (`RAM 17.0%`, app-slot flash `18.8%`). COM9 and Xiaomi are detected, but the board must not receive the generic artifact without matching enrolled device material/current CA. Clear heart/lung listening still requires authenticated WSS audio on the phone; active raw I2S counters alone are not listening proof.
- Render remains healthy at `git-329c998160ff`; GitHub Smart Health CI run `33758860584` for the exact full commit completed successfully. This Android-only checkpoint does not require or justify a backend redeploy.

## 2026-09-03 audio/AI production and device checkpoint

- Backend commit `329c998160ff` is live on Render. Migration `059` is idempotent across Supabase table-owner and Session-Pooler roles: the owner applies DDL/security while a non-owner verifies the complete contract and fails closed if it is absent. Live health reports the exact commit; anonymous AI history is `401`; CORS returns the two canonical Firebase origins and never echoes an untrusted origin.
- Platform Admin build `dist-firebase/client` is live at `https://shcare-admin.web.app` as Firebase Hosting version `18711810a882b99b`. The deployment released 135 files with no upload failure.
- Xiaomi `21081111RG` was recovered through Wireless ADB. APK SHA-256 `B079E29D90B193B00566DDBB71E9079622155E7619E1B38FBEB137032EF0A881` is installed; physical `AIAssistantScreenTest` passes `1/1` at 200% font scale. The test package was removed, the normal App was reinstalled/relaunched and has no fatal Android, DNS or TLS log. Reinstallation cleared the prior authenticated app session, so provider-backed patient/doctor chat, runtime microphone permission, real STT and file picker remain an authenticated device gate.
- COM9 is again present as CH343. A read-only serial run proves ESPTouch V2 startup and both I2S slots continue producing samples, but the board's saved `Louisnguyen` Wi-Fi returns reason `201 NO_AP_FOUND`, so WSS/audio transport is correctly disabled. Do not flash the generic production artifact over the board: the retained HIL header is for the obsolete local fixture and the device material/CA inputs are absent. A new secure App provisioning plus matching enrolled cloud identity is required before the candidate audio firmware can be flashed and HIL-credited.
- External AI remains deliberately unavailable until server-only provider variables and an approved PHI/data-processing boundary exist. Attachments remain private storage objects and are not advertised as provider-interpreted.

## 2026-09-03 audio profiles and authenticated AI assistant candidate

- Android now exposes one Shcare-styled AI assistant to both patient and doctor accounts. It has server-backed conversation history, new/select conversation, image/PDF/text/audio attachments, a lifecycle-safe Vietnamese speech recognizer, a 28-bar live voice waveform, stop-to-review transcription and explicit send. Stopping a recording never sends a message automatically.
- The backend owns the conversation/attachment contract. Migration `059_ai_conversations_and_attachments.sql` adds private, user/workspace-scoped conversations and attachment metadata; direct `anon`/`authenticated` table access is revoked. The assistant receives only backend-authorized patient/scan summaries, ignores instructions embedded in records/files, refuses diagnosis/prescribing, emits emergency escalation copy and keeps provider credentials server-side.
- The OpenAI-compatible provider seam is disabled until `AI_PROVIDER_ENDPOINT`, `AI_PROVIDER_API_KEY` and `AI_PROVIDER_MODEL` are configured. `AI_PROVIDER_NAME` and bounded `AI_PROVIDER_TIMEOUT_MS` are optional. Attachments are stored privately but the provider currently receives metadata only, so the UI/API must not claim image, PDF or audio interpretation.
- Audio capture now has explicit `heart` and `lung` profiles across backend, firmware and Android. Firmware selects one healthy physical microphone slot per frame with hysteresis instead of averaging two capsules; heart uses the bounded heart-band profile and lung uses the wider breath-sound profile. Transport remains PCM16 mono at 16 kHz and device online status still requires authenticated backend presence.
- Source/build gates PASS: backend AI `12/12`, audio protocol `4/4`, audio worker `6/6`, scan upload `15/15`, clinical workflow `8/8`, device security `87/87`; Admin contracts `209/209` plus lint/build; Portal contracts `141/141`, auth `392` plus lint/build; Android unit/build/AndroidTest compile; firmware source contracts `5/5` and production target build.
- Candidate artifacts: Android debug APK SHA-256 `B079E29D90B193B00566DDBB71E9079622155E7619E1B38FBEB137032EF0A881`; AndroidTest APK `BEE81CAF5A51F748BB758D3532B4F16DEF3EC6F300786A5D843903385774DFA1`; firmware `8A03810928FF8FE70F42B3191A1C3835EB4A3430DEDB81963F4B1F6FCAB740D9`.
- Runtime remains **PARTIAL**: this terminal currently lists neither an ADB target nor a serial port. Do not claim Xiaomi UI/STT/file-picker/TalkBack or COM9 heart/lung/WSS/scan/OTA HIL until they are rediscovered and the exact artifacts above are installed/flashed and exercised. Native PlatformIO Unity remains host-blocked because no `gcc/g++` is installed.
- Product scope for this slice: keep and finish the doctor Portal surface; do not expand the workspace/business Portal now. Existing business routes stay intact and their expansion is recorded as future development. Platform Admin retains system-wide status/control and never accepts provider secrets through the browser.

## 2026-09-03 exact-device access production closure

- Exact-device access is live end-to-end at the cloud boundary. Platform Admin creates one-time `SHC-...` codes/QRs for one device with either `viewer` (view + Wi-Fi) or `manager` (manage that exact device). Android/Portal redeem only the opaque code; user-facing handover never requires a Device ID, device secret or factory claim artifact.
- Supabase migration `058_device_access_invites.sql` is applied. Authenticated production smoke run `33646658838` / job `100303009541` PASS on Render release `git-c5f9cfab384f`: anonymous denial, invalid-code denial, viewer and manager create/redeem/replay, unused-invite revoke, tenant/device isolation and cleanup all succeeded without logging secrets.
- Firebase automatic production deployment is now symmetric for both clients. Commit `0ba4aa54` deployed Admin in run `33668876125` and Portal in run `33668876234`; CI run `33668875574` PASS. Live Admin asset `_admin.devices-CfkQpc1t.js` contains the access-code/QR handover guidance, and live Portal asset `DevicePage-DIt3ny0e.js` contains the one-time access-code copy.
- Production CORS echoes only `https://shcare-admin.web.app` and `https://shcare.web.app`; an untrusted origin receives no allow-origin header. Anonymous device-access API access returns `401`.
- Local closure evidence is Admin contracts `209/209` plus lint/Firebase build and Portal auth/contracts plus lint/Firebase build. The debug APK is `48,687,986` bytes, SHA-256 `9DE036BF7ACB63867135FED20475BDECB7D00D7367766465E7ECC97A02ED1BE6`.
- Xiaomi reappeared through Wireless ADB. The exact APK was installed with `install -r`, opened in `MainActivity`, rendered a clean 1080x2400 login surface and produced no crash/DNS/SSL/5xx log. The new `DeviceAccessRedeemScreenTest` passed `1/1` physically in `2.345s`, proving opaque-code normalization, exact granted-device navigation, no standalone Device ID field and 48dp scan/submit targets. The test package was removed and the normal App relaunched. Commit `e7be1be0` passed CI run `33670211310`, including Android, backend, Web Admin and ESP32-S3 build jobs. TalkBack is currently disabled on the handset, so an assisted authenticated sweep remains separate.
- Overall G4 is still **PARTIAL**, not complete: COM/serial discovery currently reports no board, so production WSS/ACK/dual-mic audio-v2/durable-scan/signed-OTA/forced-rollback cannot run; and the previously exposed Firebase service-account key must be replaced in Render/GitHub and revoked only after the replacement is verified.

## 2026-09-02 device access code/QR candidate checkpoint

- The user-facing device enrollment contract is now one opaque, one-time Platform Admin code: `SHC-XXXX-XXXX-XXXX-XXXX`, or its canonical QR `shcare://device-access?v=1&code=...`. Android and Portal no longer ask a doctor/patient for a raw Device ID. The older factory claim/Device ID APIs remain an internal factory-compatibility path and are not a user entry point.
- Platform Admin creates the code for one exact device and chooses `viewer` (view + Wi-Fi provisioning) or `manager` (manage that device). Neither scope grants Platform Admin or cross-device authority. Admin can list/revoke pending codes and active grants.
- Migration `058_device_access_invites.sql` stores only the code hash plus tenant/device/scope/expiry/audit bindings. Redeem is single-user replay-safe, tenant-exact, rejects expired/revoked/foreign-device codes, and cannot revive a revoked manager grant through a viewer code.
- Candidate gates PASS locally: device-access `12/12`; backend device-security `87/87` when run serially; Admin contracts `208/208` plus lint/Firebase build; Portal auth/contracts plus lint/build; Android unit/lint/assemble. Production deployment, live mutation cleanup and Xiaomi visual smoke are still required before this slice is marked LIVE.

## 2026-09-02 final cloud mutation and live device-assignment checkpoint

- At verification time Render was healthy on backend implementation marker `git-73669c92fadd` at `https://shcare-api-prod.onrender.com`; later documentation-only commits do not change that runtime implementation. The production fix series is `fd35db18` (nullable device timestamps), `c80fb6f6` (nullable device ownership references), `a932bdfe` (patient-share references) and `73669c92` (system-wide optional relationship normalization).
- The Supabase runtime role does not own `identity_operations`, so migration `057` is a durable marker instead of an unsafe `ALTER TABLE`. The application maps logical `doctor_workspace_assign` receipts to the released `change_role` storage discriminator while retaining `identityOperationKind=doctor_workspace_assign`; workspace-access, identity, Firebase compatibility and device-security tests cover this bridge.
- Production mutation evidence PASS: Portal run `portal-mutation-mtjvhke8` completed patient create/update/delete/replay, appointment lifecycle, notification read/delete, doctor consent share/revoke, profile/workspace/preferences restore, report export and session recovery. Admin run `admin-mutation-mtjvqho6` completed workspace, managed-admin, package, patient, doctor invitation, notification, storage/settings and 15 route checks. Every reported cleanup completed successfully.
- Public deployment and authenticated Portal role/read smokes PASS. Platform Admin is correctly denied Portal access; workspace and doctor identities receive their exact tenant-scoped surfaces.
- The approved doctor `usr_20260828091945_bf3c594e` is active in `org_default_clinic`. Device `shcare-g3-prod-demo` is assigned to that exact doctor, the assignment replay is idempotent, and the device is visible through that doctor's real Portal identity. It is intentionally not assigned to a patient yet.
- Android `1.0.0-rc.2` APK SHA-256 `C908A35E32B97A63A0B8669F10C0C2D6459598BF83FBE7F151199A56141DA9E7` remains installed on Xiaomi. A fresh cold start completed in `774 ms`; the process stayed alive with no crash, DNS/SSL, 401/403 or 5xx log. The handset remained asleep, so a new visual/TalkBack proof was not fabricated.
- COM9 read-only serial proves both I2S slot active-window counters continue increasing, but transport counters remain `wss=0` and `udp=0`; backend presence therefore truthfully reports the device offline. Production WSS, ACK, audio-v2, durable scan, signed OTA/rollback and the bandwidth canary remain the only hard runtime gates before overall G4 PASS.

## 2026-09-02 doctor workspace reassignment deployment checkpoint

- Live verification found that the approved doctor `usr_20260828091945_bf3c594e` already owns another active workspace, so the generic `change_role` operation correctly rejected a destructive primary-workspace switch. Doctor assignment now has its own audited `doctor_workspace_assign` saga: it preserves existing owner/admin memberships, activates the doctor membership in the selected workspace, updates the primary workspace and Firebase claims, and revokes stale sessions.
- PostgreSQL migration `057_identity_doctor_workspace_assignment.sql` is a durable marker because the Supabase runtime role cannot alter the owner-controlled allowlist. The logical operation is persisted through the released `change_role` discriminator and retains its dedicated operation kind in the target state. Local backend check, workspace-access, managed-admin transition/create, Firebase compatibility, device security `86/86`, identity-migration and diff checks PASS.
- This was a precursor checkpoint. Its pending live work is superseded by the final cloud mutation checkpoint above.

## 2026-09-02 unified device assignment and claim-code boundary

- Platform Admin device control now uses one audited, idempotent assignment transaction for the device workspace, responsible doctor/account and optional patient. The Admin dialog has separate workspace, doctor and patient searches, so a doctor phone number is no longer incorrectly searched only in patient records.
- Direct assignment and claim are deliberately separate. A device assigned by Platform Admin is opened in Android with Device ID only. A one-time claim code is created in Admin only for a factory-enrolled device that has been returned to unassigned workspace inventory; Portal claim remains the handover path for that inventory state.
- Returning a device to inventory clears owner/patient atomically, revokes open claim material and preserves the device/audit history. Cross-workspace assignment validates that both responsible account and patient belong to the target workspace; unauthorized or mixed-tenant writes fail closed.
- Local verification PASS: ownership lifecycle/repository JSON+PostgreSQL tests, backend device security `86/86`, Admin contracts `204/204`, Admin/Web lint and production builds, Web contracts `141/141`, Android pairing tests, debug assemble and zero-issue lint. The HTTP security regression covers Platform Admin-only assignment, mixed-tenant rejection, atomic state, source/target audit and idempotent retry; it caught and fixed the missing `allocate` receipt binding before deployment. Production-connected APK SHA-256 `C908A35E32B97A63A0B8669F10C0C2D6459598BF83FBE7F151199A56141DA9E7` is installed on Xiaomi; cold start reached the authenticated doctor dashboard and FCM registration succeeded.
- The source candidate still requires Render/Firebase promotion and live authenticated mutation/cleanup before this slice can be called live. The production health marker observed before promotion is `git-08105905a462`.

## 2026-09-02 Android doctor-surface parity and three-column quick actions

- The authenticated doctor dashboard now uses the same adaptive Shcare visual system as the patient surface: gradient header, explicit loading/offline/error/stale states, current-workspace metadata, device status, quick actions and recent results. The previous four-second infinite polling loop was removed; refresh is explicit and lifecycle-safe.
- Doctor quick actions use exactly three cards per row at normal font scale on 360/412/600/840dp surfaces. At system font scale 150% or higher they intentionally become one full-width action per row so labels and 48dp targets remain accessible. The final partial row preserves equal three-column widths.
- Patient list, clinical alerts and clinical review headers now share the branded adaptive top app bar. Raw workspace codes such as `solo_practice` are localized to `Phòng khám tư`; an offline device no longer renders meaningless `0 Hz / UDP 0` telemetry.
- Verification PASS: Android JVM `865/865`, lint report `0` issues, debug and AndroidTest APK assembly, and a clean Xiaomi instrumentation run `11/11` covering dashboard, three-column actions, 200% font, patients, alerts and reviews.
- The debug APK installed on Xiaomi has SHA-256 `7B9251D80C3EC1598F21C8B1D471F9D2F153A544909724E47669AFF43FA56C15`. Physical screenshot: `docs/report-evidence/2026-09-02/android-doctor-dashboard-three-column.png`.

## 2026-08-31 Render replacement and Admin login repair

- The active backend is now `https://shcare-api-prod.onrender.com` (`/api` API base). Public health is HTTP 200 and exact-origin CORS allows only the two Firebase surfaces.
- The Admin login failure was frontend configuration drift: the deployed bundle still contained the retired `smart-health-api-r5is` URL. Platform Admin was rebuilt and deployed as Firebase version `9eba8f080728c759`, release `1788112503921000`; the live bundle contains the new backend and neither retired Render URL.
- Shcare Web/Portal was synchronized and deployed as Firebase version `ab98cdfee8facb87`, release `1788112579000000`; its live bundle also contains only the replacement backend.
- Source defaults, release smoke tools, Android debug default, CI/deploy workflows and README examples now use the replacement backend. Validators explicitly reject both retired Render URLs.
- Security review found `/api/v1/health/data-summary` and `/api/v1/health/force-seed` were exposed as public diagnostics. Source now requires authenticated `platform.settings.manage`; production force-seed is disabled and no built-in seed key remains. Regression, backend check/smoke/security, Admin `196/196`, Web auth `390/390`, Web contracts `139/139`, lint and production builds pass.
- The frontend login connectivity defect is live-fixed. A full authenticated login/result check still requires the existing Firebase account session; do not confuse an old cached login tab with the newly deployed no-cache bundle.

## 2026-08-30 Render outbound-bandwidth root cause and repair

- Render billing showed `46.71 GB` of `Service-Initiated` bandwidth in `49.47` instance-hours while HTTP responses were only `28 MB` and WebSocket responses were `0 MB`.
- The ESP production firmware emits telemetry every `10,000 ms`. PostgreSQL device persistence upserted the canonical `devices` row and then redundantly rewrote the full encrypted `app_runtime_state` snapshot to external Supabase PostgreSQL on every telemetry update.
- The observed ratio is about `2.7 MB` per telemetry tick, matching the redundant monolithic snapshot path. SQL device saves now update the normalized row and in-process mirror only; JSON/demo mode still performs its required snapshot save.
- Regression `npm run smoke:device-hot-path`, device security, device ownership repository, and backend `npm run check` pass. Deploy this commit before restoring or migrating Render, then monitor `Service-Initiated` growth with a one-device budget below `100 MB/day`; do not assume a new free workspace alone fixes the incident.

## 2026-08-30 Firebase live deployment and Render billing suspension

- The latest Platform Admin bundle is live at `https://shcare-admin.web.app`, Firebase Hosting version `d224ae4ce12e5c4c`, release `1788099682710000`.
- The latest Shcare Web/Workspace Portal bundle is live at `https://shcare.web.app`, Firebase Hosting version `313f5ceb7b176f87`, release `1788099819212000`.
- Direct Admin and Portal routes return HTTP 200 and the deployed bundles point to `https://smart-health-api-r5is.onrender.com/api`; the Portal bundle contains no `localhost:3000` API target.
- Render still lists backend deploy `829bc0f114cd` as the latest live deploy, but service `srv-d978ur1kh4rs73e22fmg` is provider-suspended with `suspenders: ["billing"]`. `/api/health` therefore returns Render's non-JSON `Service Suspended` page and the public deployment smoke correctly fails.
- G4 remains partial. Do not diagnose frontend source/config while Render reports this billing suspension; the Render workspace owner must clear the billing hold before authenticated/data/device production verification can resume.

## 2026-08-29 current repair slice

- Platform Admin now has audited doctor profile editing and workspace assignment. Assignment refreshes Firebase claims, revokes stale sessions, and creates the canonical doctor membership; incompatible doctor-to-personal self-switches are rejected.
- WSS authentication accepts nested and legacy top-level network telemetry, persisting WiFi/IP when the ESP reports them.
- Admin claim-code copy, workspace suspend/archive labels, and private avatar force-refresh are aligned across surfaces.
- Local backend checks, overview contract `4/4`, workspace access smoke, and Admin production build pass. Production deployment still requires authenticated Firebase/Render workflows.

## 2026-08-28 latest doctor-approval 409 diagnosis

- Production reproduction for the pending account `baobee44@gmail.com` returned
  `WORKSPACE_OWNER_TRANSFER_REQUIRED`, not a target-ID mismatch. The account
  owns its materialized active `solo_practice` workspace; approval was routed
  through the generic owner-transfer guard.
- Source fix is ready: the approval route emits a server-derived solo-owner
  marker; identity finalization bypasses only that guard for this operation,
  creates a `doctor` operational membership, and leaves workspace ownership
  unchanged. Normal owner-protection paths remain enforced.
- Local verification PASS: backend syntax/check, smoke test, and workspace
  access regression. Render deployment and live HTTP-200 approval verification
  are still required; do not claim this slice complete before that evidence.

## 2026-08-28 registration approval invariant revalidation

- Personal registration remains self-service: a verified Firebase identity is materialized as an active `patient` with an active personal workspace and does not enter an administrator approval queue.
- Doctor registration remains approval-gated: `/api/v1/auth/role-request` stores `requestedRole=doctor` with `roleRequestStatus=pending`; the operational role remains `patient` and Portal authority is not granted before Platform Admin approval.
- Clinic/business registration remains approval-gated: `/register/phong-kham` submits `/api/v1/auth/workspace-request`; the workspace and owner request remain pending until Platform Admin uses the workspace approval action. The Admin action validates the owner receipt before activating the workspace.
- Fresh verification PASS: backend lifecycle smoke; Shcare Web registration/security tests `43/43`; Platform Admin contracts `193/193`; focused Android signup/email/doctor-approval gate; live public deployment smoke; live registration-route browser smoke `81` checks; production role and authenticated Portal smokes. Live bundles contain `/auth/workspace-request`, `/auth/role-request`, `/owner-approval`, and `/admin/doctor-requests`.
- Render currently serves backend-relevant release `f248c3f1249c`; current Git `main` is `0bc0a7ae` (later commits are Android validation/documentation only).

## 2026-08-28 production email-verification repair — HIL PASS

- Git `main` is `b65bb80e`. Render deployed the backend repair at `f248c3f1249c` (the later Git commit only adjusts Android validation).
- Root causes fixed in sequence: empty patient blood type was persisted instead of SQL `NULL`; the pending solo-doctor request moved `users.organization_id` away from its canonical self-patient tenant; platform notifications persisted an empty workspace foreign key; and Android compared a dynamic solo target against the current personal workspace.
- The role-request contract now separates `organizationId` (current operational tenant) from `roleRequestOrganizationId` (workspace awaiting approval). PostgreSQL keeps the user/patient inverse identity intact while the request is pending, materializes the solo workspace, stores the target in sanitized Firebase claims, and preserves exact idempotent replay.
- Backend `check`, `smoke:workspace-access`, and `smoke:repositories` PASS. Focused Android account/email/doctor-approval tests, debug APK and AndroidTest assembly PASS.
- Production HIL on the attached Xiaomi PASS: `EmailVerificationRuntimeHilTest.verifiedFirebaseAccountIsAcceptedByProductionBackend` completed Firebase reload, fresh token exchange, production role request, tenant/membership verification, and pending-registration cleanup with `OK (1 test)`.
- Installed production-URL debug APK SHA-256: `FDB67C9F7E74AF8E92BBD78451228D5FDA6E2782F308F4238C27BB6698ED4677`. Cold-start visual proof shows `Đang chờ duyệt tài khoản bác sĩ`, `Email đã xác thực`, and no former email-status/server error. Evidence: `docs/report-evidence/2026-08-28/android-email-verification-pending-approval.png` (SHA-256 `5086353B391044528AEAB07E98EDCAC9DBDE219721A43A0E733DA1E3B7543BFF`).
- Expected next lifecycle state is administrator review; email verification itself is complete. Do not recreate or re-submit this pending request manually.

## 2026-08-28 latest authoritative handoff

- Do not trust the older line that says G4 completed. Current status is **G4 partial**.
- Lane identities: Git `main=d19b009e`; Render backend `2a4359686db5`; Portal Firebase `a130d4b26582e44c`; Admin Firebase `44de8648d0125d7c`.
- Live data is truthful Postgres production: `devices=0`; authenticated audit found 5 active workspaces, 4 managed admins, and no smoke/test admin or workspace artifacts. Do not recreate demo device rows to make screens non-empty.
- Admin lock/unlock now uses the canonical audited account-status PATCH, deployed live. Source gates pass: Admin lint/build/contracts `193/193`; public deployment smoke passes; prior full live Web matrices passed (`5025` public, `3615` authenticated); authenticated Portal role smoke passes.
- Long Admin mutation automation is blocked by Render/Cloudflare managed challenge HTTP 429 even at paced rates. Every failed run's settings/admin/workspace cleanup returned HTTP 200 and the independent inventory audit is clean. Treat this as a WAF/CI evidence blocker, not a successful full mutation run.
- Android on Xiaomi is production-URL debug build SHA-256 `64FF4B99C2D475BBE733253D05372CE22EBC82662A1F4B2DE71D7CDC167DC48C` with no ADB reverse mappings. Firmware production-profile build SHA-256 is `22359D81D52FE6D04C039D5C8A2236EB7A87454006D22EEE31DBA3965707C151`; COM9 exists.
- Remaining hard blockers: Android release keystore/signing; disposable factory-enrolled production device and secure credential channel; approved encryption/eFuse provisioning runbook; production device WSS/ACK/audio-v2/durable scan/signed OTA/forced rollback; fresh unlocked-phone visual/accessibility proof; Cloudflare CI allow-rule or test origin.

## 2026-08-28 live synchronization checkpoint

- Current source is `main` at commit `d19b009e` and Render health plus `/api/v1/health/data-summary` are healthy at backend commit `2a4359686db5`. Production reports `dataBackend=postgres`, `authMode=production`, and currently `devices=0`; this is the authoritative live data and must not be replaced with demo rows.
- Firebase Hosting was rebuilt and released: Portal `shcare` version `a130d4b26582e44c`, Admin version `44de8648d0125d7c`. Both public URLs return HTTP 200 with `Cache-Control: no-cache, no-store, must-revalidate`.
- Verification: backend check/security suites PASS, Web live public/auth matrices `5025/3615`, Portal authenticated production smoke PASS, Admin contracts `193/193`, lint and production build PASS, Android unit/lint/online debug assemble PASS, firmware production build PASS.
- Android production-URL debug artifact SHA-256 `64FF4B99C2D475BBE733253D05372CE22EBC82662A1F4B2DE71D7CDC167DC48C` was installed successfully on the attached Xiaomi over ADB; no credential was injected and no local reverse mapping remains.
- Fixed two release-test drifts: API production smoke now resolves a tenant-visible device instead of the retired `esp32-stethoscope` fixture; Admin ESLint ignores generated `dist-firebase-portal` output so CI does not scan generated bundles.
- Three full browser sweeps timed out in the host when run without filters; filtered production/route checks pass. This is an environment/runtime limitation, not a product PASS claim for every browser matrix case.
- G4 is still not closed: live Postgres currently has no devices, and Render production secret/provider/migration evidence plus authenticated production mutation/HIL evidence are still required. The old LiteSteth-A92 screenshot is stale and is not evidence of current production data.

## 2026-08-27 Gate G3 Physical Hardware HIL Pass Checkpoint

- **Kết quả thực nghiệm vật lý:** Board ESP32-S3 hai mic (`shcare-g3-hil`) và điện thoại Xiaomi đã kết nối thành công End-to-End.
- **Sửa lỗi cấu hình HIL:** Phát hiện board vật lý dùng flash không mã hóa eFuse khiến firmware production kích hoạt `CREDENTIAL_STORAGE_ENCRYPTION_REQUIRED` và tắt WSS. Đã nạp firmware HIL development (`buildDeviceHilFirmware.mjs`) lên COM9. Board đã nhận mạng Wi-Fi `Louisnguyen` (`192.168.1.14`) và mở kết nối WSS bảo mật về proxy 3767.
- **Xác nhận trên thiết bị thật:** Ứng dụng Shcare Android trên Xiaomi đã xác nhận trạng thái trực tuyến của thiết bị. Dashboard hiển thị: `"Shcare ESP32-S3 hai mic — Đang trực tuyến — Firmware 1.0.2"`.
- **Minh chứng:** Ảnh chụp màn hình tại `docs/report-evidence/2026-08-27/android-device-online-hil-success.png`. Cổng G3 chính thức PASS 100%. Cổng G4 vẫn PENDING chờ cấu hình secrets production trên Render và migration PostgreSQL Live.

## 2026-08-27 Antigravity Full Transfer & Synchronization Checkpoint

- Toàn bộ 254 kỹ năng và tri thức vận hành của Codex đã nạp toàn cục tại `~/.gemini/config/skills.json` và `~/.gemini/config/GEMINI.md`.
- Hợp nhất thành công toàn bộ 92 file RC2 (+7.403 dòng) vào nhánh `main` (commit `b458d864`).
- Cài đặt thành công thư viện `tomli` trên môi trường Python 3.10.
- Kết quả kiểm định 100% PASS: `@shcare/contracts` 51/51; backend `check`, `test`, `smoke:device-security` 84/84, release & identity 15/15, workspace/role/import/storage smokes; Android unit tests 27/27 tasks; Android APK Local Demo (`82CB443CBBCA881ACCFD50AEE358CE771BA50985CB9C755046307484A1294B97`) biên dịch và cài đặt thành công lên Xiaomi qua ADB; Web Portal và Admin client+SSR build thành công; Firmware ESP32-S3 sản xuất và OTA biên dịch thành công.
- COM9 thu nhận trực tiếp 409 dòng serial telemetry I2S dual-mic thực tế; bộ hồ sơ minh chứng KLTN được đóng gói tại `docs/report-evidence/2026-08-27/`. Ranh giới G3/G4 được tuân thủ nghiêm ngặt.

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

> 2026-08-27 full automated gate: backend check PASS; device-security `84/84`; release/CORS/identity contracts `15/15`; workspace-access and repository smoke PASS; Web Portal typecheck/lint/contracts/build PASS (`139/139` contracts); Web Admin lint/contracts/build PASS; Android unit/lint/local-demo assemble PASS; firmware production and `esp32-s3-ota` builds PASS. Candidate firmware `A36C9B22C5319D3CE2F89EA31250FF853459FD070C4DAC3926AB263F9F27BB07` was uploaded with verified writes to physical ESP32-S3 COM9; OTA image hash `D17E2BE9022FA23C03E0E7486AFA4EA841500AF6B8B9212442346943994C0BD3`. This remains source/local/HIL evidence, not a production promotion.

> 2026-08-27 G4 gate result: `check:production:strict` is blocked because the current process has no production secrets/provider bindings (PostgreSQL, S3, PHI/HMAC/2FA, OTA signing, public release marker and production frontend env). Public deployment smoke is PASS for reachability/health/401/rewrite, but live `/metrics` still identifies the older backend revision. No Firebase Hosting or Render deploy was executed.

> 2026-08-27 candidate integrity: branch `release/shcare-v1.0.0-rc.2-local-demo` is at HEAD `9457cb17c97299b5f8a1e6ccbff061ef7d75cb89` with 95 tracked/untracked working-tree entries, so a clean release freeze/manifest is still required before any G4 deploy.

> 2026-08-27 provider access audit: Firebase CLI `15.28.1` is authenticated and can see project `smart-health-stethoscope`; no Supabase CLI/access token or Render API key is present in the process. Do not fabricate provider credentials or push/deploy without the approved secret manager and clean candidate freeze.

> 2026-08-27 live authenticated smoke: with the retained Firebase Web configuration loaded only in-process, `smoke:portal-production` PASS against `https://smart-health-api-r5is.onrender.com`; platform account is correctly blocked from Portal (403), workspace admin and doctor Portal read surfaces pass. This proves live compatibility only; it does not prove the new RC2 role endpoint is deployed.

> 2026-08-27 deployment status check: `https://shcare.web.app/` and `https://shcare-admin.web.app/` are reachable (HTTP 200), and the Render API `https://smart-health-api-r5is.onrender.com/api/health` plus `/api/v1/health` respond HTTP 200. Render `/metrics` still lacks the RC2 release markers, so the live backend is the older deployment; the current RC2 permission/APK changes remain local/preview-only. No production promotion was performed.

> 2026-08-27 local access check: current RC2 dev servers are reachable at Portal `http://127.0.0.1:8765/`, Admin `http://127.0.0.1:8766/`, with demo backend `http://127.0.0.1:3765/`. These are the latest local sources; the public URLs above still serve the previously promoted revision.

> 2026-08-27 authorization APK refresh: local-demo APK `B6FA41D8EA2FCEAAF4B02C114FEEB9D832E0F4F2F7EF1CF8AFA2D0C23C8B0616` was assembled and installed on the attached Xiaomi (`com.example.smart_health_android`, version `1.0.0-rc.2`). It includes the permission-denied guidance linking to Portal → Bác sĩ và nhân sự → Điều chỉnh quyền. Install succeeded; no credentials were injected. G3 remains active and G4 has not started.

> 2026-08-27 workspace authorization continuation: added the missing workspace-staff role-change flow. Workspace Portal managers can PATCH `/api/v1/portal/staff/{userId}/role` with an idempotency key; JSON/SQL membership storage updates role atomically, writes `workspace.membership.role_change` audit, rejects self/owner/foreign membership changes, and exposes device-management capability guidance in Portal Staff UI. Platform Admin remains a separate `/admin` surface for cross-tenant admin accounts and platform capabilities. G3 remains active; no G4 deployment claim.

> 2026-08-27 Android permission guidance: the permission-denied pairing state now explains that workspace managers grant access from Portal → Bác sĩ và nhân sự → Điều chỉnh quyền, then the affected account must refresh/sign in again. Android JVM/lint passed after this UI update; this does not grant authority from the phone and does not bypass backend RBAC.

> 2026-08-27 continuation: RC2 device-flow fixes are implemented and verified. ESPTouch V2 presence polling runs concurrently with broadcast, canonical online-success navigation is restored, and device settings now use one backend-confirmed/idempotent release action that retains history. Current proof: Android JVM `860/860`, Pairing `5/5`, Health `2/2`, shared HTTP `51/51`, firmware source contracts `5/5`, production/OTA builds, COM9 upload hash `7756A0EE72062EB74EE1A3A745903A6C2AE0CB95DA672F5F46E2779591B13879`, and physical WSS/ACK/audio-v2/durable-scan PASS. G3 remains active for remaining provider/accessibility/final-candidate evidence; do not start G4.

> 2026-08-27 cross-surface local proof: Portal/Admin lint, contract suites and production builds pass; backend precheck, CORS `4/4` and release/runtime/security plus identity-migration contracts `11/11` pass. Formal security-diff scan did not start because the host's Python 3.10 misses `tomli`; do not treat that as a clean scan. G3 remains active for physical/production-provider evidence; G4 is pending.

> 2026-08-27 Android evidence: local-demo APK `C5244E518789C2A9A1A0BDE3927301733FF7C71D320559BCDA5ADE1E1EC06580` is installed on Xiaomi; JVM `857/857`, Kotlin compile, AndroidTest artifact assembly and lint `0` warnings pass. The real UI HIL is not failed: Xiaomi returned to keyguard and only system UI is reachable. Do not bypass it or inject the Wi-Fi password; resume foreground ESPTouch proof only when the device is unlocked.

> 2026-08-26 latest physical ESPTouch handoff: COM9 is present as `USB-Enhanced-SERIAL CH343 (COM9)`. The targeted Xiaomi test `EspTouchV2HardwareNegativeCredentialHilTest` passed `OK (1)` in `64.657 s` using a real tenant-scoped setup session and only a deliberately invalid diagnostic Wi-Fi password. COM9 serial proves signal detection followed by credentials decrypted and Device-ID binding accepted. This is real Xiaomi -> ESPTouch V2 AES -> exact-device-binding evidence and cannot change the customer router. The Android client now uses the active AP BSSID (not a scanned 2.4 GHz BSSID); the shared reserved-data wire form is AES-protected ASCII-safe `v2:` plus 16-byte digest hex after an observed Android-2.2.1/ESP-IDF high-bit round-trip incompatibility. Current APK SHA-256 `CAE017E6FA72BED797FAD71FC2255C682203B0401DC574A7A6CBF66788076FF3`; flashed firmware SHA-256 `8C7E2D08C2C987AE3EF10DD7C67B0E3A84199B708FD45A611EDEA909B55D0BFD`.
>
> Next only: foreground Shcare needs its normal precise-Location runtime consent (currently not granted after reinstall), then the user-entered secure password flow must prove association/DHCP -> authenticated WSS -> Online. Do not insert a real password in ADB, shell, test arguments, source, environment, or logs. G3 remains active; G4 remains pending.

> 2026-08-26 physical continuation: Xiaomi is unlocked and COM9 is present as `USB-Enhanced-SERIAL CH343 (COM9)`. A guarded ESPTouch V2 broadcast HIL using only fake key/password passed `OK (1 test)` on the physical phone, proving the broadcaster starts while the phone remains on the current dual-band router. Device Management → dedicated secure Wi-Fi form also passed `OK (1 test)`. COM9 boot serial reports `ESPTouch V2 KDF golden-vector self-test passed`, listener opened, BLE disabled and audio capture ready. A stale Xiaomi Settings `NetworkRequestDialogActivity` task remains from the retired pre-fix handover test; clean normal App start after stopping that task reaches Dashboard, and the current production source plus ESPTouch library contain no network-specifier API. Do not count the fake test as real provisioning. The real secure-field Broadcast → association/DHCP → WSS chain remains open and the actual password must stay inside the phone field.

> 2026-08-26 latest superseding Wi-Fi transport checkpoint: Xiaomi rejected the previous automatic ``WifiNetworkSpecifier`` 2.4 GHz handover before any ESPTouch packet was emitted. The active Android path now has **no** network specifier, Android temporary-network chooser, process-network binding, SoftAP, BLE, browser, or IP workflow. It keeps the existing router association, selects the same-SSID 2.4 GHz BSSID from the location-authorized scan when available, then starts ESPTouch V2 Broadcast. This is the closest correct equivalent of the company's Device ID → Wi-Fi-password → broadcast flow; an ESP32-S3 cannot receive raw 5 GHz frames, but a dual-band router may forward the broadcast to its 2.4 GHz radio. The official Espressif FAQ says this configuration can work and identifies router multicast forwarding/5 GHz phone attachment as a reliability variable. Full Android JVM `857/857`, lint, local-demo assemble, AndroidTest assemble, backend SmartConfig/device security `65/65`, backend syntax check, and production/OTA firmware builds pass. The new APK SHA-256 `7A1C18FBFC77846CBFA2FE4B612D5F6A988ADB0826B43B4C020CD40A1E9A38C0` is installed on Xiaomi with local reverse mappings. A fake-credential physical broadcaster smoke is not PASS because MIUI exposed no current SSID to its background instrumentation surface; no secret or real ESP configuration was sent. COM9 is not present in this host session. G3 remains active; do not start G4.

> 2026-08-26 latest runtime handoff: the phone’s generic connection screen was traced to the wrong APK configuration: a default-debug build pointed at Render while its retained `firebase_patient_demo` account belongs to the local demo. Backend `3765` and Firebase Auth emulator `9099` were healthy. `assembleLocalDemoDebug` is now the dedicated no-property LAN build task and its source-contract test passes. Current installed artifact SHA-256 is `59EE3111045AFBA2AE3EA64EE28FB70C0D67F55583CD4EDA1F6A1C83AA480E4B`; generated BuildConfig has local API/Auth values. ADB reverse maps `3765` and `9099`; after a cold start the Xiaomi is visibly on the real Patient Dashboard with the tenant-scoped device card. MIUI blocks shell input injection, so the attempted automated card tap neither disproves nor proves subsequent navigation. G3 remains active and G4 has not begun.

> 2026-08-26 current Xiaomi ESPTouch blocker: APK `3D32084C2B3BEA6F9D6A58CF470CFD4F27B3320E50A4B8A64AC459A9AC7898F9` is installed. Physical foreground instrumentation reproduced an immediate stop before broadcasting because the phone's active Wi-Fi radio is 5 GHz; ESP32-S3 accepts only 2.4 GHz SmartConfig. This is not an ESP, backend, permission, or direct-ACK failure. Android now begins the trace at “checking network”, completes that step only after its band validation succeeds, and shows a precise 5 GHz requirement rather than falsely marking 2.4 GHz complete or showing a generic broadcast failure. The new `EspTouchV2BroadcastStartHilTest` uses invalid test key/password only and must be rerun on a 2.4 GHz phone connection. No real Wi-Fi password is in tooling. G3 remains open; G4 has not started.

> 2026-08-26 current provisioning-debug handoff: the Xiaomi debug APK is `7FAD70770FFAC046EA8AAEC1F99B2EE6AFF67E3D28D1D6A99D2D40FD212CAC9C`. Espressif V2's `onStop` is the completion of the bounded UDP broadcast when no direct response returns; it is not proof of an ESP-side failure. Android now preserves that distinction, polls authenticated exact-device presence, redacts and clears the password on error/retry, and resets stale failure UI. It includes only the normal Wi-Fi state permission required by the SDK plus Location for current SSID/BSSID; `NEARBY_WIFI_DEVICES` remains absent. Focused regression/source tests, AndroidTest Kotlin compilation and lint `0` errors pass. Do not claim ESP acknowledgement, association/DHCP or WSS until real hardware evidence is captured; G4 has not started.

> 2026-08-26 current Android permission handoff: debug APK `13A29A898EF512FF0279826754F440E91741EB86AACFE0F800C1F26D3E792479` is installed on Xiaomi and removes the stale `NEARBY_WIFI_DEVICES` declaration. ESPTouch V2 broadcasts configuration; it does not scan, pair, or connect to nearby devices and uses no BLE. Android permits access to the current SSID/BSSID only through precise Location, requested at the provisioning boundary with clear Vietnamese copy. Canonical manifest/source contract, denied-permission behavior, and Kotlin compilation pass; package inspection confirms no nearby-device permission. Continue G3 from secure phone Wi-Fi setup into real broadcast, association/DHCP and exact-device WSS proof; G4 has not started.

> 2026-08-26 latest ESPTouch V2 handoff: COM9 normal firmware flash is real and write-hash-verified, SHA-256 `623072C1A59C05312F318712A99E0570806DBCE1814A7E637236C0C89516B647`; OTA image SHA-256 is `AFAA53C90A3B5F0C13AA8470500AE91FA6AC7ECCF042EF6ACD3EE763F3CFE806`. Serial boot says `ESPTouch V2 KDF golden-vector self-test passed` then listener opened. Xiaomi has the current LAN APK SHA-256 `CB018EE8815FD0222D8B261B9A34820AE878083298ED01FC471A27C981A4F62C`. Source proof is backend focused security `83/83`, Android V2 contract proofs, and normal/OTA firmware compilation. Do not claim Broadcast, association/DHCP, WSS, ACK, audio-v2, scan or OTA completion: the phone is locked before its secure Wi-Fi field.

> 2026-08-26 active ESPTouch V2 migration: this worktree now uses encrypted ESPTouch V2 Broadcast for the customer Wi-Fi path. Backend setup-session returns only V2 AES-128 key material plus a versioned Device-ID binding, with tenant DeviceManage checks, `no-store`, and user/device/IP throttling; Android keeps that material outside Compose state and clears it on success, error, cancellation and session expiry; firmware listens non-blockingly and persists received credentials only after association/DHCP plus binding validation. Focused backend security `83/83`, Android main/test compilation plus `DeviceSmartConfigV2ContractTest`, and ESP32-S3 normal build pass. This is source/build evidence only: the new firmware/APK are not yet flashed/installed and physical ESPTouch/WSS proof remains open.

> 2026-08-26 current G3 evidence: the Wi-Fi form now opens directly to manual SSID/password entry; it does not request current-SSID permission until the user explicitly selects its helper. This removes the Xiaomi system-dialog overlay that previously blocked the form. Fresh proof: Android full unit `856/856`, lint `0` errors / `3` non-blocking warnings, Xiaomi `PhysicalDeviceProvisioningHilTest` `OK (1 test)`, backend check + device security `83/83` + setup security `3/3`, and firmware source/normal/OTA builds pass. COM9 identifies the ESP32-S3 rev 0.2 with 16 MB flash and 8 MB PSRAM; the normal SoftAP image was uploaded with write-hash verification. LAN APK SHA-256 `00BC681014D3A0CBB73DC6575B1621B9A64A75491359480447A5AF32231EFA3F` is installed on Xiaomi. G3 is still not closed until secure on-device target-password entry proves ESP association, WSS/auth, command ACK, audio-v2, durable scan, signed OTA and forced rollback.

> 2026-08-26 Dashboard Device Management correction: G0-G2 remain complete; G3 is active and G4 is pending. A paired Dashboard card now navigates to `device-management?deviceId=...`, not Device Pairing. The ViewModel accepts that selection only after the current tenant-scoped backend list contains the ID; stale, deleted, or cross-workspace IDs fall back safely. Empty state and explicit **Thêm thiết bị** alone show the Device ID form.

> Wi-Fi is now `DeviceWifiSetupScreen(deviceId)`: a separate SoftAP-only UI titled **Kết nối Wi-Fi**, with no Device ID entry, QR, BLE, browser, IP, setup-SSID or setup-password fields. Expiry stays in Wi-Fi with retry-in-place. Evidence: Android full JVM PASS; Xiaomi Compose `5/5`; Firebase-demo Dashboard navigation `1/1`; backend check, device security `83/83`, setup-session security `3/3`; firmware source contract and normal/OTA builds PASS. Lint has `0` errors. LAN APK SHA-256 `D1C0A52C895C1C3F9793C371DC1EB4CB1985109A623273EF0C1DBBF6A18484FE` is installed/launched on Xiaomi.

> Physical G3 remains BLOCKED, not PASS: the guarded provisioning HIL meets Android system UI before secure target-password entry, and no ESP COM port is currently visible. No target Wi-Fi secret was put into tools. Do not claim ESP association, WSS/auth, command ACK, audio-v2, durable scan, signed OTA/forced rollback, G3 closure, deployment, or G4 start.

> 2026-08-26 Android startup repair: `BackendConfig.API_BASE_URL` now maps the configured HTTP host to `/api/v1` (not obsolete `/api`), and an owner-bound restored session rejected with HTTP 401/403 is terminated then sent to Login rather than mislabeled as an offline failure. Full Android JVM tests pass. The current demo APK targets the healthy local backend/Firebase Auth emulator and is installed on Xiaomi; a physical restart reached the device flow without the former connection-error screen. No credentials were automated.

> 2026-08-26 latest hardware proof: Windows rediscovered the ESP32-S3 on COM9. The SoftAP auto-start repair was uploaded successfully and the filtered boot diagnostic confirmed the local setup portal and port-80 recovery server started. It did not report an AP-start failure, Wi-Fi radio disablement, or unexpected AP closure. The Android trace APK remains installed. Target-network password entry, ESP association and WSS/ACK/audio/OTA proof remain open; no credential is stored in this checkpoint.

> 2026-08-26 SoftAP auto-start repair: the firmware now enters its protected local SoftAP portal whenever it has no saved Wi-Fi, instead of disabling the Wi-Fi radio. Android now exposes a five-step in-app connection trace (SoftAP, ESP API session, configuration send, restart, cloud confirmation) without displaying the target SSID or password. Firmware source contract, PlatformIO production compile, focused Android JVM/build and physical Compose trace HIL pass. The new APK is installed; the repaired firmware binary is **not yet uploaded** because no serial ESP port is currently present. Do not claim target-network/WSS success.

> 2026-08-26 final SoftAP checkpoint: after installing the updated Android APK and uploading the ESP32-S3 SoftAP-only firmware, `PhysicalDeviceProvisioningHilTest` passed `OK (1 test)` on Xiaomi in `25.791s` through Device ID → Device Settings → native target-Wi-Fi input. It stops before the secure target password is supplied; target-network association, WSS, ACK, audio and OTA remain open.

> 2026-08-26 hardware application: the ESP32-S3 firmware was uploaded and hash-verified on COM9, then hard-reset by the uploader. It is the SoftAP-only build; target Wi-Fi association and WSS proof remain untested because Xiaomi's keyguard blocks the foreground HIL before App UI.

> 2026-08-26 SoftAP-only correction: Shcare provisioning no longer requests or uses BLE. Android removes BLE permissions, provisioning classes/tests and browser/System-Wi-Fi fallback; it joins the ESP SoftAP through `WifiNetworkSpecifier`, calls the ESP local `GET /api/v1/setup/session` then `POST /api/v1/setup/wifi`, and returns to cloud confirmation. Firmware no longer starts BLE provisioning and has a compile-time guard against enabling it. Android full JVM, debug/AndroidTest assembly and the ESP32-S3 production build pass. A new physical run is BLOCKED at the phone keyguard before app UI appears; do not call target-network/WSS proof passed.

> 2026-08-26 Wi-Fi HIL: fixed the Device Settings → `device-wifi/{deviceId}` route that was denied as unknown by the typed mobile route contract. `PhysicalDeviceProvisioningHilTest` now follows Device ID only and passed `OK (1 test)` on Xiaomi to the native target-Wi-Fi input boundary. Do not pass target Wi-Fi credentials through tooling; full ESP association/WSS/ACK/audio/OTA evidence remains a G3 gate.

Last updated: 2026-08-26

## 2026-08-27 OTA HIL checkpoint

- Physical PASS: COM9 ran authenticated WSS, command ACK, audio-v2/durable scan and signed OTA to `1.0.2`; OTA HTTPS now uses verified `shcare-hil.local` TLS over the HIL LAN IP without `setInsecure`.
- Root cause and repair: COM9 physically has 16 MB flash. Arduino-ESP32's weak default verifier was marking a `PENDING_VERIFY` image valid before Shcare boot health; firmware now defers that verifier until its authenticated WSS/durable boot-health state machine decides.
- Forced invalid-device-credential candidate `1.0.3` was rejected by WSS and **physically rolled back** to `1.0.2`; backend recorded OTA `rolled_back` and command `OTA_ROLLED_BACK`. Candidate SHA-256: `168A598A8EA502B004A28DABF598CDF64259A0C3A04011410B203BD6C18ABBBB`.
- This closes only the OTA rollback HIL gate. G3 remains active for the real secure-field ESPTouch association/DHCP and final Android/provider/cross-surface evidence; G4 is still pending.

## 2026-08-25 restart delta — G3 physical pairing evidence

- Governing plan remains [Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md): G0–G2 complete, G3 in progress, G4 pending.
- Xiaomi HIL now proves the local QR/manual claim path `1/1` and the current-Wi-Fi SSID reader `1/1`. The claim test accepts only generic semantic outcomes and now recognizes the safe session/permission-denied screen, so it cannot report a false timeout while exposing no setup material.
- Focused Android pairing/BLE contract JVM gate is `38/38`; debug and AndroidTest LAN artifacts build and install successfully. Nearby Bluetooth is not yet granted, so BLE GATT, device Wi-Fi join, authenticated online, ACK/audio/OTA evidence remains `BLOCKED`, not failed or complete.
- Current firmware source drift gate passes. The COM9 read-only ESP32-S3 probe confirms revision v0.2 and `16 MB` physical flash; the generic PlatformIO `8MB` banner is not a hardware measurement. No flash occurred in this probe.

## 2026-08-25 restart delta — G3 QR image selection

- Governing plan: [Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md). State: G0–G2 complete, G3 in progress, G4 pending.
- `DevicePairingScreen` has both camera and system-library QR input. `AndroidDeviceQrImageDecoder` restricts ML Kit to QR format, processes the chosen `content://` image locally and closes the scanner; the ViewModel emits the existing QR claim action only after a decoded value. Images with no QR, unreadable images and files over 10 MB return an inline local error without contacting backend.
- Proof: fresh `DevicePairingViewModelTest` `33/33`, AndroidTest compile/assemble, `lintDebug` and debug assemble; retained aggregate JVM gate `852/852`. Current LAN debug artifact: `897775F474DB1EC306DED901B9985FC6234860851279322C73944898A558D34F`. Xiaomi install of that artifact succeeded; visual HIL is paused only because the phone is asleep/secure-locked and MIUI blocks ADB input injection. Do not call that a product failure or a pass.
- Follow-up HIL: once unlocked, `IntegratedDemoLoginSmokeTest` passed `1/1` and reached the pairing entry/gallery control. A system Google-account confirmation screen then appeared. Never automate the choice; wait for the user to resolve it before the real photo-picker selection test.

For an interrupted task, read `SMART_HEALTH_ACTIVE_CHECKPOINT.md` first, then
this file. This document summarizes the durable project state, decisions,
paths, tools and closed proof so a new Codex task does not re-scan or rebuild
the whole codebase.

## Current Restart Contract — Read This Before The Historical Log

### 2026-08-15 superseding restart state

- Continue only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform
  Admin, Android và firmware”**. Phase 0–3 are complete; **Phase 4 — Device
  provisioning và command** is in progress; Phase 5–8 are pending.
- Phase 3 final proof is Web Avatar `62/62`, Auth `396/396`, contracts `121/121`,
  TypeScript/lint/build/diff; backend Avatar `22/22` + API, 2FA `35/35`, and
  backend aggregate gates. Independent exit review found no P0/P1. Do not reopen
  Phase 3 without a current reproduced regression.
- Resume Phase 4 from `SMART_HEALTH_ACTIVE_CHECKPOINT.md`: backend device
  trust/RBAC, Android secure QR/manual + setup-AP/PoP + authenticated-online
  pairing, firmware resilience, then Admin/Portal device convergence.
- Deep Security remains separate at `running/preflight`. Provider/live proof is
  `BLOCKED`; physical firmware/HIL proof is `DEFERRED — chờ phần cứng`.

- Governing plan: **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Do not create a replacement plan after quota exhaustion, context compaction, task restart, or power loss.
- User-visible progress is the original Phase 0–8 overview only: Phase 0–3 are
  complete; **Phase 4 is in progress**; Phase 5–8 remain pending. Internal slice
  labels are implementation details and must not replace the overall phase view.
- Canonical implementation worktree for this checkpoint: `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-rc2-impl-8e2`. The frozen Security source worktree must not be edited.
- Resume from `SMART_HEALTH_ACTIVE_CHECKPOINT.md`, then the newest dated handoff near the end of this file, then `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`, then the current Git diff. Treat completed rows and their recorded proof as closed.
- Before changing a closed row, reproduce a regression with one narrow drift gate. If no regression is reproduced, continue the first open row instead of rebuilding earlier Web, Portal, Admin, Android, backend, or firmware work.
- Checkpoint hiện tại: Phase 0–3 đã đóng; provider/emulator/hardware proof vẫn
  tách `BLOCKED/DEFERRED`. Phase 4 đang xử lý Device provisioning/command theo
  gap audit trong `SMART_HEALTH_ACTIVE_CHECKPOINT.md`; không mở lại Phase 0–3
  nếu chưa có regression hẹp.
- Runtime/provider/hardware gates remain separate. Missing emulator/device, Firebase provider configuration, live deployment, ESP32 hardware, or firmware HIL evidence must remain `BLOCKED`; never infer it from source, unit, build, simulator, or browser proof.

### 2026-08-15 Phase 4 candidate checkpoint — five P1 remain

- Candidate evidence is shared `44/44`; backend check plus device-security
  `42/42`; Web contracts `122/122`, claim `10/10`, device-route subset `8/8`;
  Admin `183/183`; Android `108` suites / `781` tests, devices `48/48`, main and
  AndroidTest compile, lint and assemble. Android APK SHA-256 is
  `F32C7C3A85E40A217ACC8AEEC2DDF6DD0DA6694FA69B53BC4AF94263DD6828FE`.
- Firmware source-contract and MCU compile-only (`0` tests executed) pass. Normal
  and OTA images are each `1,104,640` bytes; SHA-256 values are
  `CB2B0A8749697FEEB14F4720E64A0CF8629109CDF6377784B7DB7F6CB2BAA7B5` and
  `CA79DE814DAC8D6BB3A48EB87F80E6ADDF331C62009129C013C250F30A074801`.
  The prior `FB0FDF91...` / `88143F7B...` images are superseded pre-remediation
  artifacts. Independent re-review found no remaining blocker in the four-item
  firmware remediation scope.
- Native C++ execution is unavailable because this host has no `gcc`, `g++`,
  `clang` or `cl`. Flash, serial, I2S, authenticated WSS, rollback and physical
  16 MB validation remain `DEFERRED — chờ phần cứng`.
- Phase 4 is not closed. Cross-surface review reopened five P1 software blockers:
  generic Admin command must exclude specialized revoke/rotate/OTA/audio types;
  SQL pair must share the ownership lock/current row; pair contract + Portal +
  Android must require exact active workspace and verify receipt/poll authority;
  Admin revoke needs a stable `Idempotency-Key`; and shared/OpenAPI needs exact
  command/revoke/rotate/OTA contracts. Resume these five items from the active
  checkpoint, then rerun the affected gates and independent review.

## 2026-08-09 Phase 2 closure and Phase 3 restart handoff

- Web final: active CSS graph `0` `!important`, contracts `121/121`,
  Auth/component `309/309`, CSS `60.58 kB gzip`, local LCP `276 ms`, INP
  `64 ms`, CLS `0.00034024`; Chromium/Firefox/WebKit Public and Portal matrices
  pass. Public initial graph is `228,654 bytes gzip`.
- Admin final: contracts `185/185`, lint/build pass; representative clinics,
  account and device browser flows prove permission, state, 2FA/preference and
  drawer behavior.
- Android final: `682/682`, lint `0/0`, compile/AndroidTest/assemble pass; APK
  SHA-256 `FE74074AFE6D6B470A5ECBC67FB48CED50A01B21829B544FF46D86805D72324B`.
- Phase 3 active parallel slices are Android Forgot Password architecture,
  Android Family CRUD receipt/idempotency and Web/backend Workspace Settings
  atomic mutation. Read `SMART_HEALTH_ACTIVE_CHECKPOINT.md` for the remaining
  P1/P2 order; do not re-scan closed foundation rows.

## 2026-08-06 superseding correction — Phase 2 remains open

- Chỉ tiếp tục **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending. Không Phase nào được gọi PASS nếu còn tiêu chí/nợ đã biết thuộc Phase đó.
- Web exit audit: foundation `27/27`, contracts `114/114`, Auth/component `288/288`, TypeScript/lint/build pass; CSS `62.10 kB gzip`, fonts `82,572 bytes`. Portal passes Chromium `459`, Firefox `458`, WebKit `459` checks over 21 routes per selected case; Public critical passes Firefox phone and WebKit desktop (`16` checks each).
- Android exit audit: focused `5` suites / `32` tests, main Kotlin and AndroidTest Kotlin compile pass, diff check clean; no P0/P1 in native foundation.
- Phase 2 remains open for CSS debt `1,839`, public initial graph about `270,304 bytes gzip`, visual/live Web Vitals, Android route root tag, 32 literals, external deep links, font-200% geometry, SignUp abandonment/back and runtime/device/provider proof.
- Canonical account-session revocation receipt was started early before this correction. Finish its already in-flight backend/Web/Android integration to avoid a half-integrated security contract, but do not count it as a Phase transition; Phase 3 remains pending.
- Runtime remains `BLOCKED` without Firebase config, ADB target, provider/live credentials or hardware. Deep Security remains separate at `running/preflight` and untouched.
- Restart from `SMART_HEALTH_ACTIVE_CHECKPOINT.md`, this section, the newest ledger row and current diff. Finish only the in-flight session-revoke integration, then return to all remaining Phase 2 obligations.
- Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` is a separate paused branch at `running/preflight`. Do not modify, fail, cancel, or merge it into the main plan without the user's explicit remediation choice.
- After every meaningful checkpoint, update this block if the active row or global Phase changes, append exact proof to the execution ledger, and synchronize the status/backlog/commands/test-matrix/index documents before yielding.

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

- `D:\Study\KLTN\docs\SMART_HEALTH_ACTIVE_CHECKPOINT.md` while a row is unfinished
- `D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_PROJECT_INDEX.md`
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

## 2026-07-26 current handoff — master-plan Phase 2

- Continue only under the exact plan **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Additions supplement that plan; they do not replace it. User-visible progress must remain the nine global rows Phase 0–8. Current global status is Phase 0 complete, Phase 1 source/simulator complete with live/HIL release gates, **Phase 2 in progress**, and Phase 3–8 pending/partial as recorded in the execution ledger.
- Active implementation worktree: `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-rc2-impl-8e2`. Frozen scan/source worktree `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-rc2-source-v2` must not receive implementation edits while the durable Security Scan is running.
- The Android authority/navigation foundation now fails closed across account/Firebase identity, membership/workspace/capability, direct routes, foreground, retained 30-second TTL, configuration cancellation, token rotation and replacement-session races. Terminal authorization events are request-epoch bound and remain queued until acknowledged teardown/navigation; missing runtime cannot compose a protected destination.
- Fresh proof is `279/279` unit tests across 43 suites, `25/25` connected tests on the API 35 Android 15 AVD, debug assemble, focused compilation and clean diff check. APK is `24,841,196` bytes with SHA-256 `367D9A2E17AAF05839510196F8FB699165A5A0882F5518952E306EF5279D91A7`.
- The independent final review reports no P0/P1/P2 in this authority hardening. Do not reinterpret this as complete Android UI/UX, provider proof or release proof: `google-services.json` was absent, so real Firebase/FCM; live backend/PostgreSQL; TalkBack manual; physical Android device; firmware HIL and production promotion remain `BLOCKED`.
- Next aligned work stays inside Phase 2: build the native adaptive `ShcareScaffold`, patient/doctor compact navigation, bottom navigation → rail behavior and state/accessibility foundation. Android remains independent from Web UI; only brand semantics and business contracts are synchronized.
- Durable Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains running in preflight/recovery state because the required deep-scan start capability is unavailable. Do not fail, complete or fabricate scan artifacts; resume only through its authoritative context and recovery token.

## 2026-07-27 current handoff — master-plan Phase 2

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible progress overview must remain Phase 0–8: Phase 0 and Phase 1 completed at their recorded proof levels, **Phase 2 in progress**, Phase 3–8 pending. Internal `8E-*` names are not governing phases.
- Active implementation worktree is `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-rc2-impl-8e2`. Never edit the frozen Security Scan source worktree.
- Android adaptive foundation now includes native compact navigation/rail, typed authority routing and native motion. Persistent clinical Patients/Alerts remain hidden until their real screens/contracts are implemented.
- Notification delivery is backend user/workspace/auth-session/token owned. FCM is data-only protocol v2 and carries no clinical copy, deep link, entity IDs, auth-session ID or app version. Android strictly gates protocol and owner/workspace, uses encrypted binding and signed intents, and clears delivery before identity teardown.
- Current proof: shared contracts `14/14`; backend audit `0`, check/base/repository/workspace, Firebase Admin `4/4`, notification push `9/9` including backend-to-schema parity; Android `304/304` unit across 48 suites, lint `0` Fatal/Error, debug assemble and `33/33` connected tests on the Android 15 API-35 AVD. APK SHA-256 is `DFCD7DF38E4C40C8D6A8ABC78C4E874885006FE3187E612236D13EF2ADC0BE18`.
- Do not mark Phase 2 complete. Next work is clinical Patients/Alerts, full semantic light/dark cleanup, two-pane/foldable/412 dp golden behavior, IME/edge-to-edge/font-200%/TalkBack/system-animation proof and remaining Web/Admin UI-foundation acceptance.
- Provider/live/hardware gates remain explicit: no `google-services.json`, no live migration 044, no production signing, physical Android device, firmware HIL or production promotion.
- Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains running at preflight. Required remediation was not explicitly accepted, so do not create a scan goal/workers/artifacts, update progress, fail or complete it.

## 2026-07-27 current handoff — primary-screen semantic theme

- Continue only under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** with the visible Phase 0–8 overview. Global status is still **Phase 2 in progress**.
- Android's independent mobile theme now owns distinct light/dark brand-header roles. Doctor dashboard, patient dashboard, Settings, Medical Records and New Scan use Material/Shcare semantic roles and contain no fixed white/hex/legacy light-only palette usage.
- Regression proof is `PrimaryScreenThemeContractTest` plus two runtime light/dark tests in `PrimaryScreenThemeRuntimeTest`. Fresh gates: `307/307` JVM tests across `49` suites, lint `0` Fatal/Error, debug assemble and `35/35` connected tests on `Shcare_RC2_API35(AVD)` / Android 15.
- Current debug APK is `24,849,877` bytes, SHA-256 `46E57E83EB500E379F34CF695C98C5FDFB4F00A8B6EC7223921E0C4BF168C25B`.
- Continue Phase 2 with remaining production-screen semantic migration, native Patients/Alerts, adaptive/two-pane/golden/IME/font/TalkBack work and the independent Web/Admin UI-foundation matrix. Do not delete the legacy palette until its final canonical consumer is migrated.
- Provider/live, production-signing, physical-device and firmware-HIL rows remain `BLOCKED`; this checkpoint is not a Phase 2 completion claim.

## 2026-07-27 current handoff — Android Auth and approval-state foundation

- Continue only under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Visible progress remains Phase 0–8 and the global status remains **Phase 2 in progress**.
- Signup, authenticated email verification and doctor approval now use Android-native Material/Shcare UI rather than Web layouts or legacy light-only Compose colors.
- Manual/fake OTP verification is gone. Phone/contact verification remains visibly unavailable until a real provider flow exists, and contact PII is no longer stored in the `re-verify` route.
- Doctor resubmission uses one complete `/auth/role-request` mutation and validates returned user ownership plus lifecycle before showing an accepted state; it no longer performs a partial `/me` update first.
- Fresh proof is `315/315` JVM tests in `50` suites, `35/35` connected tests on the API-35 Android 15 AVD, assemble, lint with `0` Fatal/Error and clean diff check. APK is `24,855,877` bytes, SHA-256 `061FB2B1419514A258957A2FF950DA13E23679131039372601A5B909E91304F1`.
- Continue Phase 2 with the remaining production-screen semantic migrations, real Patients/Alerts destinations, adaptive/golden/IME/font/TalkBack work and the independent Web/Admin UI-foundation matrix. Real Firebase/FCM/email provider, live database/backend, physical device, production signing and firmware HIL remain separately unproven.

## 2026-07-27 current handoff — canonical Android device settings

- The global plan/status is unchanged: **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**, **Phase 2 in progress**.
- The unused fake Bluetooth/QR demo is archived outside the Android source set with checksum provenance. The legacy `bluetooth?...` route remains only as a compatibility alias to the real `DevicePairingScreen`.
- The production device flow is QR scanner or manual claim, secure setup-AP guidance and backend-confirmed WSS online state. BLE remains absent until Android and firmware share a secure GATT contract and hardware proof.
- Stethoscope settings now show only backend/device-reported status through a ViewModel with loading/empty/error/stale/retry states. Inert audio toggles and the always-unavailable calibration action are removed.
- Fresh proof is `322/322` JVM tests in `53` suites, `37/37` connected API-35 tests, assemble, lint `0` Fatal/Error and APK SHA-256 `28225D36BAB539A032732DDE7B84C77DB52F784A9B9BAF3E29EBD88B6D4789A8`.
- Continue Phase 2 with Record Detail, Data Storage, Notification Settings and the remaining Android/Web/Admin foundation. Physical setup AP/WSS/firmware/OTA, provider/live database and production release gates remain unproven.

## 2026-07-27 current handoff — Android Record/audio artifact

- Continue only under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**; do not replace it with an `8E-*` slice.
- Record Detail is now a native ViewModel/immutable-state screen with real backend waveform data, authenticated audio playback, lifecycle/audio-focus handling, progress download, system document save and Android Sharesheet. Loading, unavailable, stale, offline, permission, retry and error paths are explicit; no sample waveform or local-only success remains.
- Backend `/api/v1/scans/:id/waveform` validates scan identity, size, sample rate and normalized points, chooses the newest AI artifact and applies tenant access/audit. Audio access is short-lived; Android forwards bearer headers only to the same origin and rechecks the auth epoch before download.
- Shared scan contracts pass `16/16`. Backend check/base/API-production/repository/storage/workspace/KLT and OpenAPI parse pass. Android passes `339/339` JVM tests in `56` suites, zero-error lint, assemble and `40/40` API-35 connected tests. APK is `24,771,946` bytes, SHA-256 `993A65B641ED179EE3163EDF64BFBF90CAD04FE6519EAF0ADDF5F348F3403CC3`.
- This is not provider/live/hardware proof. There is no `google-services.json`; live PostgreSQL/S3/Firebase/FCM, production signing, physical-device/manual TalkBack/golden QA, firmware HIL and deploy remain unproven.
- Continue Phase 2 with Data Storage/Notification Settings, remaining semantic/adaptive Android screens, real Patients/Alerts and the separate Web/Admin foundation matrix. Do not edit the frozen Security source; durable Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains at `running/preflight`.

## 2026-07-27 current handoff — Android storage/export truthfulness

- Continue only under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible plan remains Phase 0–8 and the global status remains **Phase 2 in progress**.
- Data Storage now combines real tenant-scoped backend file/byte totals with Android app-private cache measurement. Fake device quota/sync/backup values and inert controls are gone. Local cache clearing works offline and is successful only when the cache is actually empty.
- The platform-wide delete UI/client path is absent from the production app. Its unchanged 7,731-byte legacy source is archived outside source sets at SHA-256 `6E2E3E546F7EB35391764C2645B6C8EB4FA87AC00806373200F3AB6B51ABA792`.
- Export is capability-gated and supports PDF/CSV/XLSX/JSON through a native adaptive UI. Android validates owner/workspace/renderer/size/SHA, downloads only from the authenticated backend origin with auth-epoch and 100 MiB bounds, then writes the verified bytes through a MIME-specific system document flow. Job creation/download alone never displays a saved-success state.
- Current evidence: shared contracts `18/18`; backend check/base/API-production/repository/storage/workspace/KLT and OpenAPI parse; Android `356/356` JVM tests in `61` suites, lint `0` Fatal/Error, assemble and `44/44` API-35 connected tests. APK is `24,771,669` bytes, SHA-256 `28DF0BE4F51D4B1C937877C3812D4C06877A41A932017172BED100CBA88B8888`.
- Continue Phase 2 with Notification Settings, remaining Android semantic/adaptive screens, real Patients/Alerts and the independent Web/Admin foundation. Provider/live database, physical device/manual accessibility, production signing, firmware HIL and deployment remain unproven.
- Do not edit the frozen Security source. Durable Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately at `running/preflight`; no remediation choice or scan completion was fabricated in this checkpoint.

## 2026-07-28 current handoff — cross-surface notification preferences

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Visible progress remains Phase 0–8 with **Phase 2 in progress**; this checkpoint continues the old task and is not a new `8E-*` plan.
- Backend now owns an exact self-scoped notification snapshot and one-field idempotent PATCH. Portal `/portal/settings` and Android use the same cloud fields without overwriting one another; both verify exact owner/workspace outcomes before success.
- Android UI remains native and independent: Android Settings owns channel sound/vibration/display, stable channel IDs cannot bypass a disabled channel, and readiness separately requires runtime permission, app notifications, channel state and encrypted session binding.
- Push/campaign delivery remains data-only, retry-reauthorized, recipient/workspace immutable and fail closed for account, membership, session and token ownership.
- Fresh proof: contracts `20/20`; backend preferences `18/18`, push `9/9`, campaigns `8/8`; Web lint clean, Auth/component `109/109`, contracts `63/63`, build; Android `373/373` JVM in `64` suites, lint `0` Fatal/Error, assemble and `46/46` connected API-35 tests. APK SHA-256 is `78CBC616010EF6246B2B8F33CF4B3187475EB70B93215FC6BD8B0F15EB866DAB`.
- Do not mark Phase 2 complete. Continue remaining native screens/Patients/Alerts and independent Web/Admin UI-foundation/browser work. Provider/live database, physical device/manual accessibility, production signing, firmware HIL and deployment remain unproven; the separate Deep Security Scan stays `running/preflight` unchanged.

## 2026-07-29 current handoff — native Patients/Alerts

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Visible progress remains Phase 0–8 with **Phase 2 in progress**.
- The Android work immediately after notification preferences is real Patients/Alerts, not a replacement task: typed route/capability authority, canonical workspace binding, repositories/ViewModels, native compact and 840 dp two-pane UI, lazy lists, light/dark/font-scale/accessibility semantics and complete operational states are present.
- Alert mutation truth is explicit. Network ambiguity retains one idempotency key without changing local status. A stale-version `409` discards the old intent, blocks another mutation during reload and only announces the refreshed snapshot; acknowledge/resolve success is reserved for an exact backend confirmation.
- Fresh local proof: contracts `23/23`; backend check, clinical workflow `8/8`, workspace and repository smokes; Android `395/395` JVM tests in `68` suites, AndroidTest compilation, assemble, lint `0` Fatal/Error (`43` warnings, `1` hint) and clean diff check. APK: `23,779,001` bytes, SHA-256 `ED69FED5B831BA3480ABB4F9712ACFC77117D4FD7CCC5AA223045CA964D20347`.
- Do not reuse the prior connected-test number for this slice. `Pixel_8_Pro_2` remained ADB-offline with no completed boot, so Patients/Alerts instrumentation execution is `BLOCKED`; live providers/database, physical device/manual accessibility, production signing, firmware HIL and deploy remain unproven.
- Continue Phase 2 with the remaining Android acceptance matrix and the separate Web/Admin brand/primitives/responsive/accessibility/browser work. Do not edit the frozen Security source; Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains `running/preflight`.

## 2026-07-29 working handoff — personal Notification Inbox in progress

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**. This is a direct continuation after the native Patients/Alerts checkpoint; do not restart Phase 2 or replace it with an `8E-*` plan.
- The active slice is the personal Notification Inbox shared by backend contract, Portal and the independent native Android UI. Shared response/mutation schemas and fixtures exist. Backend canonical list/read/read-all/delete routes, active account/workspace authority, atomic audit/idempotency persistence and stale/cross-account denial are implemented. Portal uses canonical primitives and server-confirmed full-snapshot replacement; Android uses repository/ViewModel immutable state and native Material 3 UI.
- Verified before this working checkpoint: Portal lint and client/SSR build; backend inbox repository `8/8` including PostgreSQL commit/replay and forced-audit rollback, plus workspace-access smoke; Android inbox API/ViewModel focused tests were green before the accessibility assertion was tightened.
- Deliberate current red: `NotificationInboxUiContractTest` requires the progress `stateDescription` to come from a localized Android string resource. Production source still contains the technical literal `notification_inbox_backend_operation_in_progress`; fix that exact red before rerunning the focused suite.
- Then add inbox paths/schemas to OpenAPI, register `smoke:notification-inbox` and syntax coverage in backend package scripts, document shared-contract behavior, run full contract/backend/Portal/Android gates, attempt bounded emulator proof without wiping the AVD, calculate the new APK hash, and update all handoff/status documents. Do not claim this slice or Phase 2 complete before those gates.
- Existing verified Phase 0–2 work remains authoritative and must not be rewritten merely because a task/quota interruption occurred. On resume inspect this worktree, this handoff, the execution ledger, current diff and relevant tests; rerunning a gate is verification, not authorization to redo a closed slice.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` stays separately at `running/preflight` until the user explicitly chooses remediation.

## 2026-07-29 current handoff — personal Notification Inbox source/local closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**. This entry supersedes the working-red checkpoint above; it closes only this source/build/local slice and does not reopen or replace any earlier Phase 2 work.
- Personal Notification Inbox now shares versioned response/mutation contracts across backend, Portal and Android while keeping Web and native Compose UI independent. List, read, read-all and delete require an active account plus exact current workspace, use idempotent mutation receipts, write audit with the mutation transaction and replace client state only from a canonical server snapshot. Cross-account/stale-workspace responses fail closed.
- OpenAPI contains all four inbox operations and schemas. The backend check includes the inbox repository syntax gate and `smoke:notification-inbox`; its PostgreSQL fake proves commit/audit/replay atomicity and rollback when audit fails. Shared contract documentation records ownership and receipt behavior.
- Portal proof is Auth/component `117/117`, route contracts `63/63`, lint, client/SSR build and `smoke:notification-inbox-browser`: `66` checks across 390 px light, 768 px system-dark and 1440 px dark with real Chromium, exact authority/idempotency headers, server-confirmed read, no horizontal overflow, 44 px actions, zero axe serious/critical and zero console/request failures. The smoke also found and fixed duplicate route-level `h1` semantics in `PortalLayout`.
- Android proof is `407/407` JVM tests across `71` suites, AndroidTest compilation, debug assemble and lint with `0` Fatal/Error (`43` warnings, `1` hint). Progress accessibility copy is localized rather than exposing a technical state token. Debug APK is `23,826,433` bytes, SHA-256 `6AF72E75960018E43F074E7AC281C84CE7B6BFDD0378ACCD684B2B12BFEA0DA8`.
- Runtime/provider limits remain honest: the offline AVD was stopped and ADB now has no device, so the new Compose instrumentation is compile-proven but not executed. `google-services.json` is absent; live Firebase/FCM/PostgreSQL, production signing, physical-device/manual accessibility, firmware HIL and deploy remain `BLOCKED` or open. Firmware impact for this personal inbox slice is `N/A`; no device protocol changed.
- Resume policy after quota loss, compaction or power-off: read this latest closure plus the execution ledger and current diff, rerun a narrow gate only to confirm drift, and continue with the remaining independent Web/Admin UI-foundation and Android adaptive/manual-acceptance work. Do not rebuild a closed slice without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Public Web UI foundation source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This row directly follows the route-foundation census after Portal Staff/Notifications; it is not a new plan and does not reopen any prior Portal, backend or native Android closure.
- All `22` Public `RouteContract` entries now render inside one canonical Public shell, including the catch-all 404 and maintenance state. The header, navigation, mobile drawer, footer, Home, Product, Device, RPM, doctor/clinic/patient solution, Pricing, FAQ, Contact, Security and Legal surfaces use the Shcare brand, semantic light/dark tokens, responsive composition and truthful content instead of demo glass/glow/gradient styling or unverified hotline/customer/metric claims.
- Public motion is purposeful and bounded: reveal choreography is one-shot, capped at four items, uses only opacity/transform and treats operating-system reduced motion as authoritative over a stored preference. There is no autoplay hero media, infinite decorative loop, scroll hijack or gradient text. Controls are at least 44 px and the Security comparison scroll region is keyboard reachable and labelled.
- `scripts/publicUiFoundationBrowserSmokeTest.mjs` reads the canonical route contract and sweeps 360/390/768/1024/1440 across light/dark/system. The final source passed `5,325` checks over `330` route/viewport/theme visits with zero serious/critical axe issue, unexpected console/static/API error, horizontal overflow, undersized interactive target, backdrop/filter/glow/gradient-heading treatment, autoplay video or infinite animation. A separate Pricing rerun passed `240` checks after correcting its inactive billing-label contrast.
- Source/build evidence passes Prettier, TypeScript, focused ESLint, all Web contract tests `99/99`, and the Vite client/SSR build (`2,525`/`178` modules). Main CSS is `427.56 KB` raw / `63.87 KB` gzip, token CSS `1.38 KB` gzip and self-hosted Vietnamese fonts total about `82.57 KB`, satisfying the current CSS/font budgets.
- This does not claim Contact mutation browser proof, Firebase preview/live deployment, provider delivery, field Web Vitals, Android runtime/manual accessibility, physical-device or firmware-HIL proof. The older `signal-horizon.css` still supports unmigrated Auth/Portal surfaces; Public is isolated by the canonical final layer in the existing `clinical-polish.css`, including narrowly scoped precedence bridges. Full legacy CSS/`!important` removal remains an explicit later consolidation task rather than a false completion claim.
- Android UI/UX remains separately native and was not copied from Public Web. Platform Admin remains independent; firmware impact is `N/A`. No backend schema, migration, notification, device command, audio or OTA contract changed in this Public slice.
- Interruption rule: this section, the execution ledger and the current diff are the restart authority. Public and every earlier closure stay closed unless a current regression is reproduced. Continue Phase 2 with the **Auth shell and Auth RouteContract UI/state foundation**, then the still-open Platform Admin and independent Android adaptive/runtime evidence; do not restart the completed Public rewrite.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — canonical Web primitive tree closure

- Continue **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”** at **Phase 2 in progress**. The preceding Notification Inbox closure remains authoritative. This is the next additive UI-foundation slice, not a new plan and not a reason to reopen previously verified Admin work.
- Platform Admin was not rebuilt. Its prior independent theme/route/browser evidence remains closed. The missing Admin-local CodeGraph index was restored at `smart-health-admin/thiết kế giao diện/.codegraph`; it is Git-ignored and currently indexes `177` files, `2,218` nodes and `4,831` edges.
- Web now has one primitive source at `src/components/ui`. All `48` files under the duplicate `src/app/components/ui` tree were removed after import resolution proved the only remaining production consumers were Audit, Reports, Permission Denied, `PortalState` and `PortalExportDialog`; those consumers now import the canonical tree.
- A source contract fails if the duplicate directory or any relative/alias import resolving into it returns. TDD first proved the duplicate tree red; the full Auth/build gate then found `./ui/*` imports missed by the initial narrow resolver, so the guard was widened before closure.
- Browser acceptance found one semantic regression from the migration: Permission Denied lost its route `h1` because canonical `CardTitle` is a visual container. The route now renders an explicit `h1`. The earlier duplicate Portal top-bar `h1` fix remains intact.
- Fresh proof is contracts `64/64`, Auth/UI `117/117`, ESLint and client/SSR build (`2,514` modules). Client CSS fell from `406.45 KB`/`62.37 KB` gzip to `387.99 KB`/`60.44 KB` gzip. Local Chromium passed `123` checks for Audit/Reports/Permission Denied at 390 px light, 768 px system-dark and 1440 px dark; Notification Inbox remained `66/66`.
- Firebase production build is `BLOCKED` at its environment preflight because `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` and `VITE_FIREBASE_APP_ID` are absent from this process. No value was invented and no live/provider/deploy proof is claimed.
- This primitive consolidation changes no backend contract, Android UI or firmware behavior; their impact is `N/A`. Resume Phase 2 with the remaining Web legacy CSS/route styling and visual acceptance matrix plus the separate Android adaptive/manual runtime matrix. Never restore the deleted primitive tree to fix an import.

## 2026-07-29 current handoff — Portal device assignment source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly continues the canonical Web primitive closure; it is not a new plan and does not reopen any earlier Web, Admin or Android slice.
- `/portal/devices/assign` now uses the canonical Web primitives and Shcare tokens with one route `h1`, responsive layout, 44 px controls and explicit loading, empty, error/retry, offline and permission-safe behavior. Legacy glass/gradient/premium classes and toast-only success are gone. Queries are workspace-scoped and only show unassigned, non-revoked devices plus patients from the exact active workspace.
- New Web clients call canonical `PATCH /api/v1/portal/devices/{deviceId}` with one intent-stable `Idempotency-Key`. The backend returns the only success authority and the client verifies exact device, patient and workspace before toast/navigation. The old `/api/portal/...` alias remains compatible without a key during the backend-first migration window; a supplied key still receives canonical replay/conflict behavior.
- Runtime JSON and PostgreSQL repositories now commit ownership, audit and idempotency receipt together. Exact retry replays the stored snapshot without another audit; key/payload conflict, cross-workspace assignment, stale ownership and forced persistence/audit failure fail closed and roll back.
- Fresh proof: device API/page `6/6`; ownership repository `36/36`; HTTP v1 contracts `19/19`; Web Auth/UI `123/123`; Web contracts `64/64`; ESLint; client/SSR build with `2,514` modules and CSS `380.47 KB` raw / `59.39 KB` gzip; Chromium `189` checks across Assign Device, Reports, Audit and 403 at three viewport/theme cases; backend check/base/repository/KLT/workspace gates; OpenAPI parses `69` paths; clean diff check. An earlier workspace smoke hit one transient Windows `EBUSY` while reading its own fixture database; one bounded rerun passed, and the final post-compatibility run also passed without changing the harness.
- Impact record: actor is a workspace device operator; Web route is `/portal/devices/assign`; Platform Admin, Android UI and firmware transport are `N/A` for this web-first operational assignment slice. Android remains a separate native claim/provision/status experience and was not made to match this page. No notification or firmware schema changed; backend-first release remains safe through the legacy alias.
- Firebase production build/live/provider/deploy, Android runtime/manual matrix, physical device and firmware HIL remain unproven. Continue Phase 2 by selecting the next reproduced legacy Portal route gap and separately retaining Android adaptive/manual acceptance. After interruption, read this closure plus the execution ledger and current diff, rerun only a narrow drift gate and never rebuild a closed slice without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Billing Summary source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This is the direct continuation after Device Assignment; it is not a new task, plan or reason to reopen any earlier verified slice.
- `/portal/billing` is now a truthful read-only workspace summary. It uses the canonical Shcare primitives and tokens, one route `h1`, responsive 44 px controls, theme-safe status treatment and explicit loading, empty-package, empty-usage, error/retry and offline behavior. It does not invent a zero charge, invoice, unlimited quota, checkout or provider success.
- New Web reads canonical `GET /api/v1/portal/billing`; `/api/portal/billing` remains a read-only compatibility alias. The response parser rejects extra top-level data, malformed or contradictory usage, unsupported payment-provider claims, and any snapshot whose workspace/subscription owner differs from the active workspace. Shared HTTP v1 schema/fixture and OpenAPI publish the same manual policy.
- Browser QA first exposed insufficient light-theme contrast on a usage status badge; the badge was moved to safe semantic tokens. The test route order was also changed so the Device Assignment navigation happens last, avoiding a deliberately aborted request from contaminating the read-only Billing evidence.
- Fresh proof: focused Billing API/UI `6/6`; HTTP v1 contracts `20/20` (`27/27` including device contracts); Web Auth/UI `129/129`; Web route/contracts `64/64`; ESLint; client/SSR build with `2,514` modules, CSS `380.79 KB` raw / `59.43 KB` gzip and Billing chunk `14.57 KB` raw / `4.75 KB` gzip; Chromium `246` checks over five routes and three viewport/theme cases; backend check/base/repository/workspace/KLT gates; OpenAPI parses `70` paths with internal schema references resolved; `git diff --check`.
- Impact record: actor is a workspace billing viewer; Web route is `/portal/billing`; Platform Admin package/fleet billing operations remain a separate surface; Android is `N/A` except a future optional native read-only plan status; firmware is `N/A`. No payment provider, mutation, migration, notification or device protocol was added. Backend-first deployment is compatible through the alias.
- Firebase production/live/provider/deploy, Android runtime/manual acceptance, physical-device and firmware-HIL proof remain open or `BLOCKED`; none is claimed here. Continue Phase 2 with the next reproduced Portal foundation gap, currently Dashboard partial/error truthfulness, while preserving the independent Android adaptive/manual matrix.
- Interruption rule: after quota exhaustion, compaction or power-off, read this latest closure, the execution ledger and the current diff; rerun only a narrow drift gate. Never rebuild a closed slice unless a current test or reproduction proves a regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Dashboard source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly continues the Billing closure and does not create a new plan or reopen any Android/notification/Billing work already verified.
- `/portal/dashboard` now uses the canonical Shcare primitives and semantic tokens with one route `h1`, responsive layouts, 44 px actions and explicit loading, first-load error/retry, offline snapshot, partial recent-scan failure, empty and capability-denied states. Raw neon colors, glass/gradient/premium demo classes and client-fabricated zero fallbacks are removed.
- Web reads canonical `GET /api/v1/portal/overview` for `today` plus the local timezone offset and accepts the snapshot only when its exact workspace/range, measured KPI totals and measure/device/AI lifecycle slices are internally consistent. The old `/api/portal/overview` read alias remains compatible. Backend adds the exact `workspaceId` and measured `devicesCount`; no migration or mutation was introduced.
- Recent scans are a capability-gated supplemental request scoped to the active workspace. A supplemental error leaves confirmed KPI data visible, and any missing/cross-workspace scan identity fails closed. The UI no longer infers a review queue from five recent `aiLabel` strings or exposes the raw label; it shows the backend-owned `aiJobsFailed` count and scan lifecycle status only.
- Fresh proof: focused Dashboard API/UI `7/7`; shared HTTP v1 `21/21` (`28/28` total contracts); Web Auth/UI `136/136`; Web route/contracts `64/64`; ESLint; client/SSR build with `2,514` client modules and CSS `381.26 KB` raw / `59.50 KB` gzip; Chromium `306` checks over six routes and three viewport/theme cases; backend check/base/overview `4/4`/repository/workspace/KLT gates; OpenAPI base `/api/v1`, `70` paths, `345` internal references and no missing reference; `git diff --check`.
- Impact record: actor is a workspace dashboard viewer; Portal route is `/portal/dashboard` and its current aliases; Platform Admin keeps its independent dense dashboard and tolerates the additive backend fields; Android dashboards remain native and are `N/A` for Web UI parity; firmware is `N/A`. Backend-first deployment is compatible through the legacy alias and Web may roll back independently.
- Firebase production/live/provider/deploy, Android emulator/device/manual acceptance, physical-device and firmware-HIL proof remain open or `BLOCKED`; none is claimed here. Continue Phase 2 with the next reproduced Portal foundation gap and the independent Android adaptive/manual matrix.
- Interruption rule: after quota exhaustion, compaction or power-off, treat this latest closure, the execution ledger and current diff as authority; rerun only a narrow drift gate and continue the first open row. Never rebuild Dashboard, Billing or an older slice without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Onboarding source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly follows Dashboard and preserves all earlier Android notification/session, Dashboard, Billing, Device Assignment and primitive closures.
- `/portal/onboarding` now uses canonical Shcare primitives/tokens, one route `h1`, responsive cards, 44 px actions, reduced-motion-safe progress and explicit loading, incomplete, unknown, error/retry, offline and capability-filtered states. Legacy glass/gradient/neon classes and raw colors are gone.
- Progress is calculated only from exact backend-confirmed data available to the current role. Account/workspace steps use the authenticated `/me` identity and active exact-workspace membership. Patient/device rows must carry the active workspace identity; cross-workspace or malformed rows become `Chưa xác minh`, never `Chưa hoàn tất`. Billing reuses the strict workspace-bound manual summary contract. No unauthorized dataset is requested.
- Supplemental failure remains isolated to its step and can be retried independently. Offline or failed reads do not reduce the completion score as if the user had omitted setup. Device-online completion requires backend `online=true`; a legacy/local `connected` flag is not enough.
- Fresh proof: focused Onboarding `4/4` with deliberate all-red TDD baseline; shared contracts remain `28/28`; Web Auth/UI `140/140`; Web route/contracts `64/64`; ESLint; client/SSR build with `2,514` modules, CSS `381.21 KB` raw / `59.50 KB` gzip and Onboarding chunk `11.94 KB` raw / `4.12 KB` gzip; Chromium `363` checks over seven routes and three viewport/theme cases; same-checkpoint backend integrated gates and OpenAPI `70` paths remain green; clean legacy-style scan and `git diff --check`.
- Impact record: actor is any authenticated Portal member; API reads are existing `/me`, patient/device list and v1 Billing contracts; Portal route is `/portal/onboarding`; Platform Admin is `N/A`; Android retains its own native first-run/auth/device guidance and is `N/A` for Web UI parity; firmware is `N/A`. No backend mutation, migration, notification or device protocol changed, so Web may deploy or roll back independently.
- Firebase production/live/provider/deploy, Android runtime/manual acceptance, physical-device and firmware-HIL proof remain open or `BLOCKED`. Continue Phase 2 with the next reproduced Portal foundation gap, currently Help/support UI and mutation confirmation, plus the independent Android adaptive/manual matrix.
- Interruption rule: after quota exhaustion, compaction or power-off, this latest closure, the execution ledger and current diff are authoritative. Rerun one narrow drift gate and continue the first open row; do not rebuild Onboarding or any prior closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Help/support source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly follows the Onboarding closure and preserves every prior Android notification/session, native Patients/Alerts, Dashboard, Billing, Device Assignment and primitive checkpoint.
- `/portal/help` now uses the canonical Shcare primitives and semantic tokens with one route `h1`, responsive guide/search/form/receipt layout, 44 px controls, reduced-motion-safe interactions and explicit validation, offline, submitting, retry, unsaved-change and exact success states. Legacy glass/premium/gradient/raw-color styling, invented support contact details and the unsupported `1–4 giờ` SLA are removed.
- Support submission is no longer a self-notification or local success. New Web calls `POST /api/v1/portal/support` with one intent-stable `Idempotency-Key`; the request carries no workspace/requester authority. Web reports success only after an exact receipt matches the active workspace and authenticated requester. The legacy `/api/portal/support` alias remains during the compatibility window.
- Migration `045_support_tickets.sql` adds a private tenant ledger. JSON and PostgreSQL repository paths bind the active workspace/requester and commit the ticket, audit event and replay receipt atomically. Exact replay returns the original ticket; changed-payload key reuse, inactive workspace, authority injection and persistence failure fail closed. The JSON-to-PostgreSQL importer validates and preserves the ledger.
- Fresh proof: focused Help/API `7/7`; support repository `4/4` including the PostgreSQL transaction path; shared HTTP `22/22` and all shared contracts `29/29`; Web Auth/UI `147/147`; Web route contracts `64/64`; ESLint; client/SSR build with `2,514` modules, CSS `381.36 KB` raw / `59.52 KB` gzip and Help chunk `14.65 KB` raw / `5.03 KB` gzip; Chromium `420` checks over eight routes and three viewport/theme cases; backend check/base/repository/workspace/KLT gates; OpenAPI `/api/v1` with `71` paths, `353` internal references and none missing; clean legacy/fake-contact scan and `git diff --check`.
- Impact record: actor is an authenticated active-workspace Portal member; Portal route is `/portal/help`; Platform Admin operational ticket processing remains a later independent surface; Android is `N/A` because the locked native mobile IA has no workspace support-ticket counterpart and must not copy this Web UI; firmware is `N/A`. Migration order is backend `045` then Web, with the compatibility alias permitting independent Web rollback.
- Source/build/local-browser closure is complete, but Firebase/live/provider/deploy is not claimed. Live support mutation proof is explicitly `BLOCKED`: the durable ledger has no requester withdrawal contract, so `portalMutationSmokeTest.mjs` skips it by default and only allows an explicit `SMOKE_ALLOW_DURABLE_SUPPORT_TICKET=1` opt-in while recording cleanup as blocked. No false notification deletion or cleanup claim remains.
- Interruption rule: after quota exhaustion, compaction or power-off, this latest handoff, the execution ledger and current diff are authoritative. Run only the Help narrow drift gate if needed, then continue the first open Phase 2 row; never rebuild Help, Onboarding or any older closed slice without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal workspace selection source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly follows Help/support and preserves every earlier Web, Admin, Android notification/session and native clinical checkpoint; it is not a new plan or a restart.
- `/portal/workspace` now uses the canonical Shcare Web primitives and semantic tokens with one route `h1`, responsive card/list composition, 44 px controls, reduced-motion-safe transitions and explicit loading, session-denied, empty, offline, switching, retry, active, unavailable-metric and non-operational-membership states. Legacy glass/gradient/neon/glow/raw-color styling is removed.
- The shared `workspace-switch-request` contract permits only `organizationId`; user, role, capability, membership and audit authority remain backend-derived. Web and Android independently call `PATCH /api/v1/me` with a caller-owned `Idempotency-Key`, reuse the key for the same retry intent and expose the target only after the backend response or immediate authenticated `/me` reconciliation confirms it.
- Web now clears workspace PHI queries before exposing a confirmed target. A transport error or unconfirmed `200` is reconciled against `/me`; a third-workspace change is adopted only after clearing PHI state, while an unverifiable result closes workspace queries and never reports success. Explicit `operational=false`, suspended/revoked membership or inactive workspace is not selectable. Missing summary fields render unavailable rather than fabricated zero.
- Android UI was not copied from Web. Its existing native `WorkspaceSwitcherViewModel`/screen already has stable retry idempotency, server confirmation and adaptive mobile states; focused API/ViewModel tests passed again. The first Gradle attempt was environment-blocked because the new shell lacked `ANDROID_HOME`; rerunning with the installed SDK at `C:\Users\baobe\AppData\Local\Android\Sdk` passed without writing a machine path into the repository.
- Fresh proof: focused Web workspace API/page/context `10/10`; shared HTTP `23/23` and all shared contracts `30/30`; Web Auth/UI `153/153`; route contracts `64/64`; TypeScript, ESLint and client/SSR build with `2,514` modules, CSS `381.77 KB` raw / `59.59 KB` gzip and Workspace chunk `8.94 KB` raw / `3.34 KB` gzip; Chromium `459` checks over nine routes and three viewport/theme cases; backend `check` and `smoke:workspace-access`; focused Android workspace API/ViewModel unit gate; clean diff check.
- Impact record: actor is an authenticated multi-workspace Portal or Android member; API is existing `/api/v1/me`; Portal route is `/portal/workspace`; Android keeps its independent native workspace screen; Platform Admin and firmware are `N/A`. No backend migration, device protocol, notification or firmware change was introduced.
- Source/build/local-browser closure is complete. Firebase/live/provider/deploy, Android emulator/physical-device/manual TalkBack proof and firmware HIL remain open or `BLOCKED`; none is inferred from source tests. Continue Phase 2 with the reproduced legacy Workspace Settings route, while keeping the independent Android adaptive/manual acceptance matrix.
- Interruption rule: after quota exhaustion, compaction or power-off, this latest handoff, the execution ledger and current diff are authoritative. Run only a narrow Workspace drift gate if needed, then continue Workspace Settings; never rebuild Workspace Switcher, Help or any earlier closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Workspace Settings UI-foundation closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly follows Workspace Switcher and preserves every earlier Web, Admin, Android notification/session and native clinical checkpoint; it is not a new plan or a Phase 2 restart.
- `/portal/settings` now uses one canonical, theme-safe Shcare settings surface. It has one route `h1`, semantic Radix tabs, responsive two/four-column navigation, canonical fields/cards/buttons/checkboxes/avatar/dialogs, 44 px controls and explicit loading, permission/session denial, offline, validation, submitting, retry, unsaved-change and confirmed states. Legacy glass/premium/gradient/raw-color styling and the custom tab implementation are removed.
- Initial Profile rendering now requests only authenticated `/me`. Sessions and 2FA, notification preferences and workspace settings load only after their corresponding tab opens. Account and workspace snapshots must match the authenticated user and active workspace before they can populate UI state; a mismatched owner fails closed.
- Profile, workspace, password and notification drafts share an unload guard. Mutations clear dirty state only after a confirmed backend outcome; offline operations remain disabled and visibly recoverable. Session rows keep stable identities and destructive confirmation; notification preferences retain field-level PATCH behavior.
- Fresh proof: focused Workspace Settings `12/12` after the recorded red baseline; full Web Auth/UI `157/157`; route contracts `64/64`; TypeScript, focused and full ESLint; client/SSR build with `2,520` client modules and `173` SSR modules, CSS `379.13 KB` raw / `59.20 KB` gzip and Workspace Settings chunk `50.32 KB` raw / `14.66 KB` gzip; Chromium `525` checks across ten routes and three viewport/theme cases; clean legacy-style scan and `git diff --check`.
- Impact record: actor is an authenticated Portal account/workspace member; Portal route is `/portal/settings`. Platform Admin retains its separate account-management UI. Android keeps independent native Profile, Change Password, Notification Settings and Workspace Switcher screens and is not pixel-matched; this Web-only UI migration changes no Android code. Firmware is `N/A`; no backend migration, notification schema or device protocol changed.
- This closes only source/build/local-browser UI foundation. Stable retry idempotency and transaction/audit parity for the legacy profile, workspace, avatar and password mutations remain explicitly open for Phase 3 identity/security work; they are not inferred complete from UI tests. Firebase/live/provider/deploy, Android emulator/device/manual TalkBack proof, physical-device and firmware-HIL evidence remain open or `BLOCKED`.
- Interruption rule: after quota exhaustion, compaction or power-off, this latest handoff, the execution ledger and the current diff are authoritative. Rerun only the narrow Workspace Settings drift gate when needed, then inventory the first still-open Phase 2 Web/Admin foundation row plus the independent Android adaptive/manual acceptance row. Never rebuild Workspace Settings, Workspace Switcher, Help or any older closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Patients list/detail UI and authority closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This checkpoint continues after Workspace Settings; it is not a new plan and does not reopen the previously closed Patient CRUD or CSV-import backend slices.
- `/portal/patients` and `/portal/patients/:id` now use active-workspace query identities and fail closed unless every returned patient has the current `organizationId`. Patient Detail additionally accepts scan history only when each scan carries the exact current `workspaceId` and route `patientId`; missing, mismatched or duplicate source identity produces a retryable error and no PHI row is rendered.
- The Patients list/create flow protects dirty drafts through `beforeunload`, keeps canonical `patientId` separate from the display `patientCode`, and invalidates only the current workspace query family. Patient Detail uses the canonical Button primitive for back navigation and preserves exact receipt/idempotency behavior already closed by the earlier Patient CRUD slice.
- UI remains an independent responsive Web surface with stable browser selectors and capability-aware actions. A view-only role can read permitted records but cannot see create/save/delete controls. Android retains its separate native Patient/Family/Profile UX and receives no Web layout or component copy; Platform Admin remains separate and firmware is `N/A`.
- TDD evidence includes the initial page baseline (`2` failed / `3` passed), the initial contract/static baseline (`2` failed / `9` passed), and a final deliberate red import failure for the previously missing scan-history parser. Final proof is focused Patient UI `6/6`, focused contract/static `12/12`, full Web Auth/UI `160/160`, route contracts `66/66`, TypeScript, ESLint, client/SSR build (`2,520`/`173` modules), Chromium `624` checks over twelve routes × three viewport/theme cases, clean legacy/raw-style scan and clean diff check. CSS is `379.13 KB` raw / `59.20 KB` gzip; Patients is `11.98 KB` / `4.33 KB`, Patient Detail `14.09 KB` / `4.87 KB`, and shared patient form `14.34 KB` / `4.10 KB`.
- This is source/build/local-browser closure only. Firebase/live/provider/deploy, Android emulator/device/manual TalkBack evidence, physical-device proof and firmware HIL remain open or `BLOCKED`. Stable retry/audit work for legacy settings mutations remains Phase 3 and is not changed by this checkpoint.
- Interruption rule: after quota exhaustion, compaction or power-off, this section, the execution ledger and current diff are authoritative. Run only the narrow Patients drift gate if needed, then continue Phase 2 with the Portal Patient Import UI-foundation/browser acceptance while preserving its already closed `validate → preview → commit` backend lifecycle. Never rebuild Patients, Workspace Settings or any older closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Patient Import UI and authority closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly follows Patients list/detail; it is not a new plan, a Phase 2 restart or a reimplementation of the already closed atomic `validate → preview → commit` backend lifecycle.
- `/portal/patients/import` now treats the active workspace and selected file as request authority. Validation accepts a response only when its exact `workspaceId`, file name and byte size match the current intent. Refresh and commit additionally require the exact batch identity and reject a stale version; commit must advance the version and return an exact receipt before success is shown.
- A workspace change invalidates the operation epoch, clears the selected file/batch/idempotency intent and exposes a safe switching state. Late responses from the old workspace are ignored. Validate, refresh and commit are mutually exclusive, and successful commit invalidates only `["portal","workspace",workspaceId,"patients"]`.
- The route retains a Web-specific responsive UI using canonical primitives and semantic status tokens, one permission-state `h1`, an accessible table caption, a focus-visible file control, 44 px actions and explicit validation, preview, busy, retry, permission and confirmed states. Browser QA found and fixed an insufficient light-theme file-label hover contrast. A separate harness issue that aborted a Device request during route navigation was fixed by waiting for that route to settle.
- TDD red evidence was parser `2/5` and Patient UI `5/8`. Final proof is parser `5/5`, Patient UI `9/9`, focused contract/static `10/10`, full Web Auth/UI `163/163`, route/contracts `68/68`, TypeScript, ESLint, client/SSR build (`2,520`/`173` modules) and Chromium `702` checks over thirteen routes × three viewport/theme cases. CSS is `379.43 KB` raw / `59.30 KB` gzip and Patient Import is `30.17 KB` raw / `9.06 KB` gzip.
- Impact record: actor is a workspace member with patient-import capability; Portal route is `/portal/patients/import`. Batch import is intentionally Web/Admin-only under the governing plan, so Android is `N/A` and keeps its independent native Patient/Family UX. Platform Admin remains an independent dense surface and firmware is `N/A`. No migration, notification or device protocol changed in this UI/authority checkpoint.
- This is source/build/local-browser closure only. Firebase/live/provider/deploy, Android emulator/device/manual TalkBack evidence, physical-device proof and firmware HIL remain open or `BLOCKED`; Phase 3 legacy settings mutation parity remains open. The build succeeded with the existing non-blocking TanStack external-import warnings; no zero-warning claim is made.
- Interruption rule: after quota exhaustion, compaction or power-off, this section, the execution ledger and current diff are authoritative. Run only a narrow Patient Import drift gate if necessary, then inventory Appointments as the next Phase 2 row in the original order. Never rebuild Patient Import, Patients or any older closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Appointments UI and authority closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly continues Patient Import; it is not a new plan or a rebuild of the already verified appointment lifecycle and native Android appointment foundation.
- `/portal/appointments` now accepts list/detail/mutation data only when canonical appointment, workspace, patient, doctor, lifecycle and time identities agree. The detail dialog reads the exact backend detail endpoint. Create/edit/reschedule/status/cancel success requires an exact receipt, and one unchanged retry intent retains one `Idempotency-Key`.
- Workspace changes synchronously advance the operation epoch, close local PHI/drafts/dialogs and suppress late old-workspace results. Dirty drafts have both in-app discard confirmation and `beforeunload` protection. The create flow blocks with a visible retry state when the workspace patient catalog is unavailable.
- The assignable-doctor boundary is now consistent end to end. Backend staff responses mark membership `operational` and expose in `doctors` only approved active accounts with an active operational doctor membership in the selected workspace. Web independently rejects foreign, suspended, locked or unapproved doctor entries. Existing backend appointment validation already rejects an ineligible doctor at mutation time.
- The Portal-specific responsive UI uses canonical Shcare primitives/tokens, canonical Table/Caption, one route `h1`, 44 px actions, semantic status colors and explicit loading, empty, partial catalog failure, offline, permission, retry, busy, destructive and confirmed states. The first browser run found and fixed phone-light status contrast plus invalid mobile definition-list structure.
- Red evidence was the missing appointment operation contract, the initial component suite `5/5` failing, and a backend smoke assertion proving a suspended doctor still appeared in the assignable catalog. Final proof is component `7/7`, focused contract/static `9/9`, full Web Auth/UI `170/170`, all Web contracts `73/73`, TypeScript, ESLint, client/SSR build (`2,521`/`174` modules), Chromium `807` checks over fourteen routes × three viewport/theme cases, backend `check` plus appointment/workspace smoke, clean legacy/diff checks and absent Android `local.properties`. CSS is `378.84 KB` raw / `59.25 KB` gzip; Appointments is `36.25 KB` raw / `9.94 KB` gzip.
- Android keeps its independently designed native Appointment routes, repository/ViewModel and screens; no Web layout was copied and no Android source changed in this slice. Focused Android appointment tests passed `26/26` and `assembleDebug` succeeded. The source-verification APK remains `23,826,433` bytes, SHA-256 `6AF72E75960018E43F074E7AC281C84CE7B6BFDD0378ACCD684B2B12BFEA0DA8`.
- Impact record: actors are authorized Portal schedulers/clinicians and native patient/doctor appointment users; Portal route is `/portal/appointments`; Android retains its native counterpart; Platform Admin stays independent; firmware is `N/A`. No migration, notification schema, device protocol or firmware change was introduced. Deploy the additive backend staff response before this Web build; older Web remains compatible.
- This is source/build/local-browser plus Android unit/build evidence only. Firebase/live/provider/deploy, Android emulator/device/manual TalkBack, physical-device and firmware-HIL proof remain open or `BLOCKED`; the missing `google-services.json` means this Android build is not Firebase runtime proof.
- Interruption rule: this section, the execution ledger and current diff are now the restart authority. Run only a narrow Appointments drift gate if needed, then inventory Review/Alerts/Live as the next Phase 2 group in the original plan order. Never rebuild Appointments or any earlier closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Review and Alerts UI/authority closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly continues the Appointments checkpoint; it is not a new plan and does not reopen the earlier Android notification/session, Appointments or clinical-repository work.
- `/portal/records/review` and `/portal/alerts` now use the backend's exact review/alert capability sets for both menu and direct-route authority. List rows must carry the active workspace and canonical source identities; malformed, duplicate or foreign review/alert data fails closed before clinical content is rendered.
- New strict client operations validate complete review and alert lifecycles. Mutation success requires the exact workspace, scan or alert, requested transition/decision/note and a newer optimistic version. A synchronous workspace operation epoch suppresses late old-workspace receipts, and one unchanged retry intent retains one workspace-bound `Idempotency-Key`.
- Backend review responses now expose additive top-level `workspaceId`, matching the alert ledger. Shared HTTP v1 schemas/fixtures and OpenAPI `0.4.0` publish the same review/alert list and mutation contracts; legacy `/api/portal/...` aliases remain in the compatibility window.
- Portal UI remains independently Web-native: canonical primitives and semantic tokens, accessible card headings and definition lists, 44 px controls, responsive composition and explicit loading, empty, stale/offline, permission, retry, busy, destructive and confirmed states. Browser QA first caught the missing Review card heading semantics; it was fixed before the final sweep.
- Red evidence included missing Web operation contracts, wrong route capabilities, missing backend review `workspaceId`, and four failing authority cases for foreign rows/receipts and stale workspace responses. Final proof: focused clinical Web suites `21/21`; full Web Auth/UI `174/174`; Web contracts `77/77`; shared package contracts `31/31`; TypeScript, ESLint and client/SSR build (`2,522`/`175` modules); CSS `378.63 KB` raw / `59.17 KB` gzip; Review `10.33 KB` / `3.82 KB`, Alerts `11.84 KB` / `4.01 KB`; Chromium `939` checks across sixteen routes × three viewport/theme cases; backend `check`, clinical workflow `8/8` and workspace-access; OpenAPI `76` paths / `394` resolved internal references / none missing; clean style and diff checks.
- Android keeps its separate native Clinical Alerts UI/repository/ViewModel. No Portal layout was copied and no Android source was changed for this closure. Focused native clinical/alerts tests pass `20/20`; `assembleDebug` passes and the source-verification APK is `23,826,433` bytes, SHA-256 `6AF72E75960018E43F074E7AC281C84CE7B6BFDD0378ACCD684B2B12BFEA0DA8`. Portal review is clinician-worklist Web scope here; further native contextual review remains governed by the later scan/review synchronization slice.
- This is source/build/local-browser plus targeted Android unit/build evidence only. The build still reports the existing non-blocking TanStack external-import warnings. Firebase/live provider/database/deploy, Android emulator/device/manual TalkBack, physical-device and firmware-HIL proof remain open or `BLOCKED`; absent `google-services.json` means the APK is not Firebase runtime proof.
- Interruption rule: this section, the execution ledger and current diff are now the restart authority. Run only a narrow Review/Alerts drift gate if necessary, then continue **Live Monitoring** as the next Phase 2 target. Never rebuild Review/Alerts, Appointments or any earlier closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Live Monitoring source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly continues Review/Alerts; it is not a new plan and does not reopen any previously verified Web, Android notification/session, appointment or clinical-ledger slice.
- `/portal/live` now treats authenticated WSS as the only realtime waveform/metric authority. REST is explicitly a tenant-bound fallback for presence, recent scans, alerts and recording identity; it never manufactures PCM, waveform points or clinical metrics. Before WSS metadata and matching metrics arrive, the UI says `Chưa có dữ liệu` instead of rendering false zero values.
- New strict Web parsing requires the exact active workspace at the snapshot and every device/scan/alert/status identity, unique row IDs, canonical `online`, valid timestamps and no device secret/claim verification material. Legacy `connected=true` never becomes online. Workspace changes close the old socket, clear source state and ignore late old-workspace events.
- Backend canonical `GET /api/v1/portal/monitoring` derives workspace authority from membership, scopes every nested row, sanitizes public devices and projects only bounded REST status. `/api/portal/monitoring` remains a compatibility alias. Authenticated WSS listeners no longer receive global socket/listener counts or UDP/HTTP ports; source-bound status/session/metrics and protocol-v2 audio isolation remain intact.
- Web UI uses canonical Shcare Card/Badge/Button primitives, semantic tokens, one route `h1`, 44 px actions and explicit first-load, empty, partial cached, stale refresh, offline, 403, WSS error/reconnect, REST fallback, waiting-metadata, active recording and dropped-packet states. Device audio labels do not expose raw unknown states, and live alerts retain canonical severity/lifecycle evidence with a link to the independent ledger.
- Red evidence was the absent monitoring parser/schema, mismatched route capabilities, missing backend workspace identity, raw/global monitoring projection and the component's invented zero metrics. Final proof: focused Live API/UI `9/9`; Web Auth/UI `183/183`; Web contracts `81/81`; shared package contracts `32/32`; TypeScript, full ESLint and client/SSR build (`2,523`/`176` modules); CSS `378.63 KB` raw / `59.17 KB` gzip and Live chunk `17.50 KB` raw / `5.92 KB` gzip; Chromium `987` checks over seventeen routes × three viewport/theme cases; backend `check`, workspace-access, clinical `8/8`, device-security `41/41` and audio-v2 `4/4`; OpenAPI `0.4.0` with `77` paths / `400` resolved internal references / none missing; clean legacy-style and diff checks.
- Android keeps its independent native Live Monitoring/LiveAudio contract and UI; no Web composition was copied and no Android source changed for this closure. Focused native LiveAudio tests pass `13/13`, `assembleDebug` passes and the source-verification APK remains `23,826,433` bytes, SHA-256 `6AF72E75960018E43F074E7AC281C84CE7B6BFDD0378ACCD684B2B12BFEA0DA8`.
- Impact record: actors are authorized workspace dashboard/device/scan viewers and native scan users; Portal route is `/portal/live`; Android remains native; Platform Admin stays independent; firmware protocol is unchanged. No migration, notification contract, command or OTA change was introduced. Backend deploys before Web; the read-only alias permits independent Web rollback.
- This is source/build/local-browser plus targeted Android unit/build evidence only. Existing TanStack build warnings remain non-blocking and recorded. Firebase/live/provider/deploy, Android emulator/device/manual TalkBack, authenticated physical-device audio and firmware HIL remain open or `BLOCKED`; absent `google-services.json` means the APK is not Firebase runtime proof.
- Interruption rule: this section, the execution ledger and current diff are the restart authority. Run only a narrow Live drift gate if necessary, then inventory **Portal Devices/Consent** as the next original-plan Phase 2 group while preserving the already closed Device Assignment and consent backend work. Never rebuild Live or an earlier closure without a reproduced regression.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Devices and Consent source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly continues Live Monitoring; it is not a new plan and does not reopen Device Assignment, the patient-share repository/API, Android notification/session hardening or any earlier closure.
- `/portal/devices` now accepts only a sanitized, unique device list whose top-level and row workspace identities match the active operational workspace. Canonical `online` must be a backend boolean; legacy `connected=true` never promotes presence. Device command receipts must match workspace, device, command type, protocol, lifecycle and delivery timestamps before the Portal can report the corresponding accepted/applied level.
- `/portal/consent` now distinguishes patient consent, direct clinician access and administrative assignment through backend authority/lifecycle/recipient/audit facts. Patient, target and ledger reads are bound to the active workspace and exact patient. Create/revoke receipts must match the original intent; cached data may remain visible as stale but cannot authorize a mutation. A synchronous operation epoch drops late old-workspace results.
- Backend `GET /api/v1/portal/devices` returns only the active workspace's sanitized operational projection. Share-target and patient-share list/create/revoke responses now carry `generatedAt`, canonical workspace and patient identity. Four shared HTTP v1 schemas/fixtures and OpenAPI `0.4.0` publish the same contract. `/patients/...` remains available for the native/client compatibility window and `/portal/patients/...` references the identical OpenAPI Path Item rather than defining a divergent contract.
- Both routes remain independently Web-native: canonical Shcare primitives/tokens, responsive cards/tables, one `h1`, 44 px controls and explicit loading, empty, cached-stale, offline, permission, retry, busy, destructive and confirmed states. Browser QA reproduced and fixed a false onboarding `6/6` expectation for an actually offline device, 16 px radio focus targets and a light-theme authority-badge contrast ratio of `4.05:1`. The canonical radio primitive now exposes a 44 px focus/touch target while retaining a 16 px visual indicator.
- TDD first captured the missing strict Device/Consent parsers. Final proof is parser `7/7`, focused API `5/5`, focused page `17/17`, full Web Auth/UI `195/195` across `49` files, Web contracts `88/88`, shared package contracts `33/33`, TypeScript, ESLint, client/SSR build (`2,525`/`178` modules), CSS `379.82 KB` raw / `59.33 KB` gzip, Devices `21.11 KB` / `6.72 KB`, Consent `36.46 KB` / `10.01 KB`, and Chromium `1,128` checks over nineteen routes × three viewport/theme cases. Backend check, KLT, workspace-access, repositories and device-security `41/41` pass. OpenAPI parses with `81` paths, `412` resolved internal references and none missing.
- Android keeps separate native Device Pairing/Management and Consent UI/UX; no Web layout or component was copied and no Android source changed. Focused native Device/Consent/LiveAudio regression proof passes `59/59` across eight suites, `assembleDebug` passes, and the source-verification APK remains `23,826,433` bytes with SHA-256 `6AF72E75960018E43F074E7AC281C84CE7B6BFDD0378ACCD684B2B12BFEA0DA8`.
- Impact record: actors are authorized workspace device operators and patient-data access managers; Portal routes are `/portal/devices` and `/portal/consent`; Android retains independent native counterparts; Platform Admin device fleet/OTA remains separate; firmware contract is unchanged. No migration, notification schema, OTA or device protocol changed. Deploy the additive backend/OpenAPI contract before Web; aliases allow independent client rollback.
- This is source/build/local-browser and targeted Android unit/build evidence only. Existing TanStack build warnings remain recorded. Firebase/live/provider/database/deploy, Android emulator/device/manual TalkBack, physical provisioning/command ACK and firmware HIL remain open or `BLOCKED`; missing `google-services.json` means the APK is not Firebase runtime proof.
- Interruption rule: this section, the execution ledger and current diff are now the restart authority. Devices/Consent and every earlier row stay closed unless a regression is reproduced. Continue the original Phase 2 order by inventorying **Portal Staff and Notifications UI-foundation integration**, preserving their already closed invitation/membership and notification/session backend/native behavior.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Portal Staff and Notifications source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly continues Devices/Consent; it is not a new plan and does not reopen the already verified staff invitation/membership or Android notification/session lifecycles.
- `/portal/staff` now accepts only a strict active-workspace staff ledger. The response and every membership must match the selected workspace, roles/statuses are allowlisted, duplicate or malformed identities fail closed, and the backend projects an exact staff whitelist instead of spreading account data such as Firebase claims, 2FA/session or secret-bearing fields.
- `/portal/notifications` retains the canonical owner/current-workspace inbox and backend-confirmed read/delete behavior. Staff and Notifications now use reactive settled-authority keys: changing account/workspace first invalidates the operation epoch, clears stale drafts/dialogs/intents, renders an explicit transition and then enables only the exact new-workspace query. Late old-workspace data or receipts cannot publish success.
- Both routes use the canonical Shcare Web primitive tree and semantic tokens with one route `h1`, responsive phone/desktop composition, 44 px actions and explicit loading, empty, offline, permission, retry, busy, unsaved/destructive and confirmed states. Browser QA reproduced and fixed two real light-theme contrast issues: the Staff authority eyebrow and old global translucent `select` text. The Staff invitation dialog is included in axe coverage.
- Shared HTTP v1 now publishes the closed `portal-staff-response` schema/fixture and OpenAPI models. The Staff API whitelist exposes only operational display/contact facts plus the exact workspace membership. The existing notification inbox/preferences/provider contracts are unchanged; no clinical content or provider deep link is added to the data-only FCM wake-up contract.
- Final proof: focused Staff/Notifications `14/14`; full Web Auth/UI `204/204` across `50` files; Web contracts `95/95`; shared package contracts `34/34`; TypeScript, ESLint and client/SSR build; CSS `59.24 KB` gzip plus `1.38 KB` token CSS and self-hosted fonts about `82.57 KB`; notification browser `66` checks; unified Chromium `1,374` checks across the `21` routes currently registered in the Portal browser matrix × three viewport/theme cases. Backend `check`, workspace-access, staff invitation `7/7`, notification inbox `8/8`, notification contract and OpenAPI parse/reference gates pass; backend `npm audit` reports zero vulnerabilities; `git diff --check` passes.
- Impact record: actors are authorized workspace staff managers and authenticated inbox owners; Portal routes are `/portal/staff` and `/portal/notifications`; Platform Admin keeps its independent dense staff/campaign UI. Android retains its independently designed membership/workspace and native Notifications UI; no Compose layout or source changed in this slice. Firmware is `N/A`; no migration, device command, audio, OTA or firmware contract changed. Deploy the additive backend/OpenAPI staff projection before Web; the compatibility alias permits independent Web rollback.
- This is source/build/local-browser evidence only. Firebase/live database/provider/deploy, real FCM/email delivery, Android emulator/device/manual TalkBack, physical-device and firmware-HIL proof remain open or `BLOCKED`; no external completion is inferred.
- Interruption rule: this section, the execution ledger and current diff are now the restart authority. Staff/Notifications and every earlier Portal row stay closed unless a regression is reproduced. The next action is a **Phase 2 route-contract/foundation gap census across Portal aliases/details, Public/Auth/Platform Admin and Android adaptive/runtime evidence**; select the first genuinely open row from that census rather than inventing a new slice.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Auth UI/state foundation source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible overview remains Phase 0–8 with **Phase 2 in progress**. This directly follows the Public foundation closure; it is not a new plan and does not reopen Public, Portal, Android notification/session or any earlier verified slice.
- All `15` Auth RouteContract entries now use the canonical Shcare Auth shell with light/dark/system theme, responsive composition, one route heading, 44 px actions, bounded opacity/transform motion, authoritative reduced motion and a truthful global offline state.
- `/dat-lai-mat-khau` is no longer an alias of the request-email screen. It has a dedicated Firebase action-code flow that verifies the one-time code before showing the form, masks the resolved email, validates both password fields, confirms through Firebase before success, guards unsaved changes and exposes explicit missing/invalid/expired/retry/success states without rendering the action code.
- Anonymous approval URLs no longer manufacture a “Chờ duyệt” status; they require sign-in before displaying account-bound status. Email-verification copy no longer exposes the delivery provider. Loading and offline states are explicit instead of being converted into success-like content.
- TDD first captured the missing dedicated reset route, offline RouteContract state and anonymous/provider truthfulness defects. Final proof is focused Auth foundation `5/5`, full Auth/UI `211/211` across `51` files, Web contracts `104/104`, TypeScript, focused ESLint, client/SSR build (`2,526`/`179` modules) and clean diff check. The final Chromium matrix passed `3,615/3,615` checks over `15` Auth routes × `5` viewports × `3` themes (`225` visits), including axe serious/critical, console/request, overflow, 44 px target, forbidden visual-effect, reduced-motion and offline-shell checks. Main CSS is `427.77 KB` raw / `63.89 KB` gzip, token CSS is `1.38 KB` gzip and self-hosted Vietnamese fonts remain about `82.57 KB`.
- Impact record: actors are anonymous and account-bound Web Auth users; routes are the Auth RouteContract surface; Platform Admin keeps its independent sign-in and dense management UX; Android keeps its independently native Auth/recovery/approval UI and no Compose source changed; firmware is `N/A`. No backend migration, notification, device, audio or OTA contract changed.
- This closes source/build/local-browser Auth foundation only. A valid Firebase reset-link browser path is covered with mocked unit evidence, not live provider delivery. Firebase action-handler configuration, real email delivery, preview/live deployment, provider/database runtime, Android emulator/device/manual TalkBack, physical device and firmware HIL remain open or `BLOCKED`. Existing non-fatal TanStack dependency warnings remain recorded.
- Interruption rule: this latest handoff, the execution ledger and the current diff are the restart authority. Public/Auth and every earlier row stay closed unless a current regression is reproduced. Continue Phase 2 with the still-open **Platform Admin UI-foundation gap census**, then independent Android adaptive/runtime evidence; do not rebuild Auth after quota exhaustion, compaction or power-off.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` pending the user's remediation choice.

## 2026-07-29 current handoff — Platform Admin foundation source/local-browser closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible master status remains **Phase 2 in progress**. Public, Auth, all closed Portal slices and previously verified Android notification/session work stay closed unless a current regression is reproduced.
- Platform Admin now has the Shcare brand/theme foundation, canonical command palette, offline state, 44 px interaction floor, shared accessible detail drawer and light/dark/system responsive shell. Demo gradients, blur/glass, looping decoration, broad mobile `!important` overrides and stale Smart Health branding were removed from the production Admin path.
- Account Settings no longer calls the removed legacy `POST /me/2fa`; it reads the canonical status and does not expose an incomplete enable/disable flow. Notification preferences use field-level `PATCH /me/notification-preferences` with `Idempotency-Key`, self-owned receipt validation, per-key busy protection and cleanup proof.
- P1 acceptance now covers notification double-click serialization, Auth error live regions, exact legacy-brand backfill, drawer focus trap/Escape/focus restore and direct-URL capability denial. Runtime state proof passes loading → HTTP 503 error → retry → canonical empty → backend 403 plus a real limited patient principal denied before any protected Admin API call.
- Final verified gates are Admin contracts `169/169`, TypeScript, ESLint, production client/SSR build (`3,084`/`3,132` modules), backend `check`, notification preferences `18/18` and two-factor `15/15`. Main CSS is `114.44 KB` raw / `17.95 KB` gzip; shared token CSS is `5.10 KB` raw / `1.38 KB` gzip and Vietnamese fonts total about `82.57 KB`.
- The full Chromium `15 routes × 5 viewports × 3 themes = 225 visits` matrix passes after a reproduced dark error-badge contrast defect was fixed through the shared theme-aware danger-text token. Firefox and WebKit critical mobile/desktop journeys also pass. Aggregate runtime proof is `241` route checks, `19` each for palette/offline/Account mutation+cleanup/drawer focus, `25` representative state checks and `5` real limited-principal direct-URL denials, with Axe serious/critical, console/request, overflow, 44 px and reduced-motion checks clean.
- WebKit independently reproduced a focus-return defect after Escape because the controlled drawer captured `document.activeElement` too late. The canonical drawer now remembers the connected interactive initiator before opening through pointer/focus capture and restores it on close; the cross-engine assertion was preserved and all three engines pass.
- Android remains independently native. The doctor Patients/Alerts primary-route depth mismatch is fixed with focused motion tests passing; the 412 dp dark and doctor compact/rail scaffold sources compile, while runtime emulator proof remains open. Access Log and its date field now use a repository/ViewModel plus immutable state/action/effect, explicit loading/empty/permission/offline/error/stale/retry states, semantic theme, LazyColumn, TalkBack semantics and 48 dp targets; focused tests pass `10/10`, both debug compilers and `lintDebug` pass. A read-only production-screen inventory leaves ten direct-API screens and keeps Appointment, Device, Notifications, Patients and Alerts closed; native Settings overview is the next bounded Phase 2 migration because it has one read dependency and no provider/audio/device mutation. No Web component or layout is copied to Compose.
- Interruption rule: this section, the execution ledger, current diff and `scripts/adminUiFoundationBrowserSmokeTest.mjs` are the restart authority. Do not redo Platform Admin or any earlier closed UI slice without a reproduced regression. Continue Phase 2 from the independent Android Settings/full-gate checkpoint.
- Firebase/live/provider/deploy, Android emulator/device/manual TalkBack, production signing, physical device and firmware HIL remain open or `BLOCKED`. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` and untouched pending the user's remediation choice.

## 2026-07-29 current handoff — Android Settings and bounded clinical-status closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible master status remains **Phase 2 in progress**. This checkpoint closes two bounded Phase 2 rows; it is not a replacement plan and does not reopen Public, Auth, Portal, Admin, Access Log, notification/session or earlier native work.
- Android Settings now uses immutable authority-bound state, exact active membership and capability gates, fail-closed locked/deleted/mismatched-account handling, bounded stale PII only for I/O or HTTP 5xx, and epoch-safe global authority invalidation. Logout is single-flight, clears authority before protected UI termination and remains valid after a second login. TalkBack duplicate labels/live-region announcements and the 48 dp/heading semantics are fixed.
- Public `/api/v1/status` is a health-only projection. Authenticated `/api/v1/doctor/status` and `/portal/status` use exact current-workspace clinical projections; portal infrastructure mode is not exposed. Realtime recording selection is workspace-scoped. Android validates the exact workspace and retries authority acquisition after a transient `/me` failure. Web no longer dereferences the removed `mode` field.
- Independent review reproduced and fixed three clinical regressions (Portal `mode` crash, wrong multi-workspace recording selection and one-shot Android authority acquisition) plus three Settings issues (global authority invalidation, duplicated refresh semantics and duplicated stale announcement). No cross-tenant clinical-status leak was found.
- Backend evidence passes clinical status `4/4`, `check` and workspace-access smoke. Web evidence passes contracts `105/105`, TypeScript, ESLint and normal client/SSR build. Local scripted browser proof passes notification inbox `66/66` and Portal UI foundation `1,374/1,374`; `/portal/status` does not crash the PortalLayout in this bounded harness. `build:firebase` is explicitly `BLOCKED` in this session because all six required `VITE_FIREBASE_*` variables are absent; no credential or provider proof is inferred.
- Final Android gate passes `78` suites and `449/449` tests, main/debug-AndroidTest Kotlin compilation, debug assemble and `lintDebug`. APK evidence: `23,906,757` bytes, SHA-256 `D1611B9E51D4E7DBC39DFE4106D307C58641688040E8CC94BA90CB9A56456BDD`. The read-only inventory now has `9` production screens that still call the API directly.
- `app/google-services.json` is absent and `adb devices` has no attached target. Emulator/device runtime, manual TalkBack/golden QA, FCM/provider delivery, Firebase preview/live, production signing, physical device and firmware HIL remain `BLOCKED`; the successful source/build gates do not substitute for them.
- Interruption rule: read this section, `SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md` and the current diff before editing. Treat Settings and bounded clinical status as closed unless a narrow drift gate reproduces a regression. Continue Phase 2 with **Patient Dashboard authority-bound native foundation**. Keep the full clinical dashboard UI/stop-scan migration for Phase 5.
- Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight` and untouched pending the user's remediation choice.

## 2026-07-29 current handoff — Patient Dashboard source/build/local closure

- Continue only under **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. User-visible status remains Phase 0–1 complete, **Phase 2 in progress**, and Phase 3–8 pending; this checkpoint does not complete Phase 2.
- Backend now exposes versioned `GET /api/v1/patient/dashboard`. Canonical `activePatientId` selects the active profile, which must belong to the authenticated owner/account/guardian and exact operational workspace; every scan and device is scoped to that profile. Foreign tenant, profile, scan or device identities fail closed instead of being mixed into the snapshot.
- Shared HTTP v1 schema, fixture and OpenAPI describe the same bounded response. Android validates protocol, account, workspace, active patient and device ownership before publishing immutable state.
- The native Compose route now uses repository/ViewModel state, authority epoch and capability-bound actions. Its independent mobile UI covers loading, empty, partial, stale, offline, permission, error and retry states; adapts across 360/412/600/840 dp with large-font one-column fallback; uses backend-confirmed `online`, nullable battery including `0%`, typed `NewScan`, 48 dp targets and TalkBack/live-region semantics. AI remains hidden until provider availability is authoritative.
- Final proof: Android focused Patient Dashboard `32/32`, full unit `473/473`, `compileDebugKotlin`, `compileDebugAndroidTestKotlin`, `assembleDebug` and `lintDebug`; backend patient-dashboard `7/7`, workspace-access, `check` and `npm test`; shared contracts `35/35`. APK is `24,001,564` bytes with SHA-256 `BDD617D4E175892660720BD9944F0A6055B200DDE5A1FFD792BB1DD45ACC22AE`.
- `app/google-services.json` is absent and `adb devices` is empty. Emulator/golden/manual TalkBack/FCM/live-provider/physical-device/hardware proof remains `BLOCKED`; no runtime or deployment completion is inferred.
- Clinical P0 debt remains intentionally outside this Phase 2 closure: `scanIsNormal` still appears in `DashboardScreen`, `MedicalRecordsScreen` and `RecordDetailScreen` and must be replaced by multi-state clinical presentation in Phase 5.
- Restart from this newest handoff, the execution ledger and current diff. Keep Patient Dashboard and prior rows closed unless a narrow regression is reproduced. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains untouched at `running/preflight`.

## 2026-07-29 superseding handoff — Patient Dashboard authority and retry hardening

- Governing plan: **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The only user-visible phase map is: Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending. This hardening checkpoint supersedes the earlier Patient Dashboard proof; it does not complete Phase 2 or create a new plan.
- Canonical implementation worktree: `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-rc2-impl-8e2`. On restart, read this section, the newest execution-ledger row, the current worktree diff and the latest test artifacts before editing.
- `GET /api/v1/patient/dashboard` is a pure authority-bound read. It does not create/backfill patient rows or mutate account, audit or presence state. Canonical `activePatientId` is persisted only by the accepted, idempotent `PATCH /api/v1/me/active-profile`.
- Active-profile validation now rejects deleted, foreign-principal and wrong-workspace profiles before any patient bootstrap can run. Rejected mutations persist neither account nor patient changes. Accepted retries return the exact original receipt; a safe legacy receipt is upgraded only when current state still matches, otherwise the backend returns stable `409 IDEMPOTENT_ACCOUNT_RESULT_STALE_LEGACY`.
- The dashboard snapshot remains a closed versioned DTO. Backend/OpenAPI/shared schema expose bounded patient, scan and device fields only. Android now rejects wrong JSON types, fractional/out-of-range telemetry and non-canonical identities instead of accepting `optString`/`optBoolean` coercion.
- Android Family Profiles retains one `(patientId, Idempotency-Key)` across I/O, HTTP 5xx and unconfirmed response retries, clearing it only after confirmed success or a definitive 4xx. A confirmed active-profile switch must match account, Firebase identity, workspace, legal principal and active patient; it then advances the mobile authority subject epoch so Back cannot restore cached PHI from the previous profile.
- Fresh proof: backend Patient Dashboard `9/9`, workspace-access, `check`, `npm test` and repository smoke pass; shared contracts `35/35`; Android authority/dashboard focused tests `62/62`; full Android unit tests `487/487`; `compileDebugKotlin`, `compileDebugAndroidTestKotlin`, `assembleDebug` and `lintDebug` pass. APK: `24,018,920` bytes, SHA-256 `751A9CDACB18B18D19C8CE88116D24B664451495FDFF2AC68EBD5BD9CF311C20`.
- Runtime evidence remains separate and `BLOCKED`: `app/google-services.json` is absent and `adb devices` has no target, so emulator/golden/manual TalkBack/FCM/live-provider/physical-device/hardware completion is not claimed. Phase 5 still owns removal of `scanIsNormal` from `DashboardScreen`, `MedicalRecordsScreen` and `RecordDetailScreen`.
- Interruption rule: never reopen this or an earlier closed row merely because quota, compaction or power loss ended a task. Reopen only after reproducing a current regression. Continue by inventorying the next genuinely open Phase 2 Android-native foundation row from the current source and ledger, while keeping Web/Admin and Android UI/UX independent.
- Frozen Security source remains untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight`.

## 2026-07-29 in-progress restart checkpoint — account password contract

- Continue only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible phase map remains Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending. Patient Dashboard and every earlier verified row remain closed unless a current regression is reproduced.
- The next bounded Phase 2 row is the cross-surface account password workflow, not a new plan. Its invariant is one client reauthentication followed by one backend-owned, idempotent provider mutation and an exact account-bound receipt. Android and Web must not update Firebase first and then separately ask the backend to catch up.
- Android source now has an authority/workspace/epoch-bound repository/ViewModel screen, exact untrimmed secret validation, stable retry key, unsaved-change confirmation, native IME/inset/TalkBack/48 dp states and receipt-only logout. `AppNavGraph` binds the route to the current authority, invalidates stale ownership, opens the canonical forgot-password route and uses the existing clear-authority-first logout coordinator.
- Current narrow proof is `20/20` focused Android tests across the password ViewModel, route access, HTTP receipt parser, native UI contract and direct-API boundary. The first run intentionally exposed a JUnit `Unit` signature error in the new blank-key test; the corrected rerun passes. This is not yet a closed slice.
- Still in progress: backend exact idempotent receipt/audit contract and matching Web Portal flow, followed by integrated backend/Web/Android full gates, APK hash and the normal seven-document final checkpoint. Do not report the password workflow complete from this intermediate row.
- Restart procedure: read this newest section, the newest execution-ledger row, current `git diff`, and generated test results. Resume the unfinished backend/Web integration and full gates; never restart Public/Auth/Portal/Admin, notification/session, Patient Dashboard or another closed row.
- Frozen Security source and its workflow-owned artifacts remain untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight`.

## 2026-07-29 superseding handoff — account password source/build/local closure

- Resume only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The user-visible phase map is Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending. This closes the in-progress password row; it does not complete Phase 2 or reopen Patient Dashboard, notification/session, Public, Auth, Portal or Platform Admin foundation work.
- Shared HTTP v1 schema/fixtures and all three clients now require the same exact receipt `{ok:true,user:{id},provider,operationId,replayed}`. The client reauthenticates the current Firebase identity but never mutates provider state directly; the backend is the sole password mutator and uses one stable required `Idempotency-Key`, a keyed sensitive fingerprint, durable provider execution, transactional account/audit/notification finalization and owner-bound replay.
- Web Portal and Platform Admin retain independent browser UX; Android retains its native Compose UX. All surfaces preserve untrimmed secrets, reject stale account/workspace/epoch authority, keep one key only across ambiguous retries, suppress double-submit and cannot show success or sign out a replacement account before the exact receipt.
- Web auth races are owner-aware: a late account-A authentication, Firebase callback or sign-out completion cannot clear account B's bearer or UI. Android checks ownership before, during and after reauthentication/provider mutation/recovery/receipt, distinguishes backend user ID from Firebase UID, clears only the stale owner and uses the canonical clear-authority-first logout coordinator.
- Final P1 review reproduced a Firebase deletion race after valid current-password proof. `updateFirebaseLinkedAccount` could return `firebaseAlreadyMissing`, and the generic saga predicate treated it as success. Confirmation now receives the operation and requires `updated: true` for `reset_password`; regression coverage proves the former false-success path fails closed.
- Proof: backend Firebase/password tests `22/22`, `npm.cmd run check`, `npm.cmd test`, `smoke:repositories`, `smoke:workspace-access` and `smoke:klt-contract`; shared contracts `29/29`; Web Auth/UI `227/227` in 52 files, Web contracts `105/105`, lint, client+SSR production build and Portal UI-foundation Chromium `1,374/1,374`; Admin contracts `175/175`, lint, client+SSR production build and targeted `/account` desktop-dark Chromium checks for route contract, palette, offline, 2FA/preferences, reduced motion, title/brand, heading, theme, 44 px, overflow, Axe and console/request cleanliness.
- Android final gate passes `86` suites / `518/518` tests, `compileDebugKotlin`, `compileDebugAndroidTestKotlin`, `assembleDebug` and `lintDebug`. APK: `24,066,508` bytes, SHA-256 `5DC07A7E02A0F97FB62C80FBD1201EDBE5E3E2174F71F335FBCA053917DE9FD0`.
- Evidence remains separated honestly: `app/google-services.json` is absent and the SDK ADB device list is empty; live Firebase and PostgreSQL recovery, emulator/device/manual TalkBack/Remove Animations, production signing and physical-device/HIL proof remain open or `BLOCKED`. The full Admin browser matrix timed out in this run; only the targeted modified `/account` route was rerun successfully.
- Interruption rule: after quota exhaustion, compaction or power-off, read this newest section, the newest execution-ledger row, current diff and latest test/APK artifacts. Never redo this password row or any older closure without first reproducing a regression. Next, inventory the seven explicit legacy direct-API screens (`ContactVerificationScreens`, `DashboardScreen`, `DoctorApprovalPendingScreen`, `LiveMonitoringScreen`, `MedicalRecordsScreen`, `NewScanScreen`, `SignUpScreen`) and choose the smallest Phase 2 foundation row that does not steal Phase 5 clinical/audio scope.
- Frozen Security source and workflow artifacts remain untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight`.

## 2026-07-30 in-progress restart checkpoint — email verification and role request

- Continue only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. The visible phase map remains Phase 0–1 complete, **Phase 2 in progress**, Phase 3–8 pending. The account-password row and every earlier verified row remain closed unless a current targeted test reproduces a regression.
- `docs/SMART_HEALTH_ACTIVE_CHECKPOINT.md` is now the first restart authority for unfinished work. It must be refreshed before long gates or a planned stop, while this context file and the execution ledger remain the durable authority for closed evidence.
- The active row is Android registration → email verification with an ownership-bound native repository/ViewModel and a matching versioned role-request contract. It is not a new plan. Full clinical Dashboard/Live/Records/New Scan remains Phase 5.
- Already implemented in this unfinished row: typed Android verify-email route construction and tests; Web role-request intent/receipt parsing, stable idempotency key, canonical v1 route, owner checks and conditional token cleanup. Approval Pending now proves stable-key retry and rejects a foreign-account receipt before refresh/success. Focused Web role-request/approval tests pass `14/14`, and Web TypeScript `--noEmit` passes.
- Still in progress: backend/shared exact role-request receipt and dedupe; Android repository/ViewModel and pending-registration ownership binding; native Contact Verification integration/resources; Doctor Approval compatibility; complete focused/full gates, APK hash, cross-surface review and the normal seven-document closure.
- After interruption, read the active checkpoint, this newest handoff, the newest ledger row and current targeted diff. Preserve in-flight changes and continue from the first open item. Do not restart account password, Patient Dashboard, notification/session, Public, Auth, Portal or Admin foundation work.
- Frozen Security source and workflow-owned artifacts remain untouched. Deep Security Scan `1b48646c-c3fe-4835-9526-92177be380ae` remains separately `running/preflight`.

## 2026-08-01 superseding handoff — registration, email verification and role-request closure

- Continue only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 remain pending. This closes the registration/email-verification/role-request row for source/build/local proof; it does not complete Phase 2 or reopen earlier rows.
- Web doctor and clinic registration now bind every retry, document receipt and approval transition to the exact Firebase UID, backend bearer, account, canonical workspace, intent fingerprint and file SHA-256 identity. Identity fields lock after account creation, A→B→A reauthentication fails closed, Approval Pending performs an authenticated `me()` authority preflight, and no replacement owner can inherit success or cleanup.
- Backend/shared contracts now enforce exact account/workspace/idempotency/audit ownership, deny arbitrary patient self-enrollment into another clinic, stream role documents with a hard 10 MiB limit, reject cross-tenant import object keys and clean only uncommitted per-attempt objects. A reproduced winner/loser cleanup race is closed with random 96-bit candidate keys plus exact ledger ownership checks; the loser cannot delete the committed winner.
- Android keeps its independent native Compose UX. Email Verification and Doctor Approval require one coherent active operational workspace/membership; notification registration ACK parsing is exact-type and owner-bound; logout/unregister pins account A's Firebase and backend authority so a paused A→B replacement cannot lose B's token, session or notifications.
- Final Web proof: Auth/UI `57` files / `288/288`, contracts `105/105`, local TypeScript, ESLint and client+SSR build; CSS `63.89 KB` gzip. Independent review found no remaining P0/P1 in the reviewed Web scope.
- Final backend proof: role-document repository `13/13`, shared contracts `38/38`, syntax/check, base smoke, isolated workspace-access, repositories and diff check. Independent review found no remaining P0/P1 in the reviewed backend scope.
- Final Android proof: focused `40/40` in six suites; full `93` suites / `579/579`; main and AndroidTest Kotlin compilation, assemble and lint pass. APK is `24,123,768` bytes with SHA-256 `C0230EB545E4BFA34D9EE68857CC0FE9C6C1C2217783F3874557F08E338FE7E6`. Independent cross-review found no remaining P0/P1 in the four remediations.
- Evidence remains separated: `google-services.json`, an ADB device and live PostgreSQL/provider credentials are absent, so Firebase/FCM, emulator/device/manual TalkBack, live database/provider and physical-device proof remain `BLOCKED`. Deep Security remains separately `running/preflight` and was not touched.
- The stale Codex `$bunx tsc --noEmit` card had no live Bun/TypeScript process. The installed local compiler passed in `13.72s`; future Web gates must use `smart-health-web\node_modules\.bin\tsc.cmd --noEmit --pretty false` with a timeout.
- Restart from `SMART_HEALTH_ACTIVE_CHECKPOINT.md`, this newest section, the newest execution-ledger row and the current diff/proof. Keep this row closed absent a reproduced regression. The inventory selects **Android Doctor Approval architecture-bound native foundation** next; SignUp follows it, while Dashboard/Live/Records/New Scan remain Phase 5.

## 2026-08-02 superseding handoff — Doctor Approval and role-target authority closure

- Continue only **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 are complete, **Phase 2 remains in progress**, and Phase 3–8 remain pending. This closes Doctor Approval for source/build/local proof; it does not complete Phase 2.
- Android Doctor Approval now has a repository/domain/ViewModel boundary, immutable state, typed action/effect, lifecycle-aware collection and a renderer-only Compose screen. Catalog partial failure/retry, busy-state input freeze, unsaved drafts, stable idempotency intent, polling restart, cancellation, double-submit and stale lifecycle actions are behaviorally covered.
- Current operational workspace and requested target are distinct authorities. Pending/needs-info remains an active patient membership in the personal workspace; approved requires the exact target and active doctor membership. Draft restore binds Firebase user, backend user, current workspace and target workspace.
- Email Verification accepts the same backend-shaped personal→clinic pending/needs-info contract and still rejects foreign current workspace, target mismatch, premature target doctor authority and incoherent approved receipts.
- Logout from Doctor Approval pins the full Firebase owner binding (UID, email and session epoch). A→B→A replacement is rejected before teardown, while the original owner still receives ordered notification/push/backend/Firebase cleanup.
- Backend closes target drift through Admin approval override, `/me` workspace PATCH and active-profile selection; patient bootstrap remains in the current operational workspace. Approved responses/replays are projected only after the exact target membership/current workspace exists.
- Final proof: shared contracts `31/31`; backend `check`, `test`, workspace-access and repository smokes; Android `95` suites / `611/611`, AndroidTest Kotlin compile, assemble and lint. APK `25,552,231` bytes, SHA-256 `84D99052B50E91282589F81DF94BDCC8BFF606CD410BC6E4CC84132364B216FA`; lint `0` errors (`43` warnings, `1` hint). Independent backend and Android reviews report no remaining bounded P0/P1.
- The stale Codex `$bunx tsc --noEmit` card had no live compiler process. The installed Web compiler passed in `9.36s`; use `smart-health-web\node_modules\.bin\tsc.cmd --noEmit --pretty false` with an explicit timeout, never `bunx`, for this gate.
- Runtime/provider evidence remains separate and `BLOCKED`: `google-services.json` is absent, ADB has no target and live PostgreSQL/provider credentials are unavailable. The dual-purpose `organizationId` contract and non-atomic approval saga remain explicit P2 debt.
- Restart from `SMART_HEALTH_ACTIVE_CHECKPOINT.md`, this section, the newest ledger row and the current diff/proof. Keep Doctor Approval and older rows closed unless a current regression is reproduced. The active Phase 2 row is now **Android SignUp architecture-bound native foundation**; clinical/audio screens remain Phase 5. Deep Security stays separately `running/preflight` and untouched.

## 2026-08-02 handoff superseding — đóng các đường Android auth/session đã sửa

- Chỉ tiếp tục **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 đã hoàn tất, **Phase 2 vẫn đang thực hiện**, Phase 3–8 còn pending. Handoff này supersede con trỏ auth/session đang hoạt động nhưng không sửa hoặc xóa các hàng lịch sử và không tuyên bố Phase 2 hoàn tất.
- `FirebaseOwnerBinding` chính xác hiện đi xuyên Splash, Login, SignUp, Verify và Doctor. Năm P1 đã được sửa: Verify recapture owner, Doctor ABA owner, stale termination replacement, reauthorization global clear và workspace/profile stale global teardown.
- Xác nhận workspace/profile chỉ được chấp nhận khi khớp đúng snapshot `MobileSessionAuthority`; cùng identity nhưng session epoch mới bị từ chối. `AppNav` không còn đường global `authorityStore.clear()` hoặc `SmartHealthSessionTerminator.terminate()` có thể xóa/kết thúc owner thay thế.
- Review độc lập cuối cùng ghi nhận P0: không, P1: không, P2: không trong các đường đã sửa. P2 riêng còn mở là việc bỏ dở tài khoản SignUp một phần hoặc Back có thể để Firebase owner tồn tại trên Login công khai.
- Full Android unit đạt `98` suites / `655` tests, failures `0`, errors `0`, skipped `0`. Gate `:app:compileDebugAndroidTestKotlin :app:assembleDebug :app:lintDebug --rerun-tasks` `BUILD SUCCESSFUL` trong `4m43s` với `56` tasks. Lint có `43` warnings, `0` errors và `0` vấn đề auth/session trong phạm vi; `git diff --check -- smart-health-android` sạch.
- APK debug có kích thước `24,172,920` bytes, SHA-256 `CEB6BFC23995B361AD0BD23B24F4F836E0464BCB215105C8A6EDE8BACDAC5F69`.
- `app/google-services.json` không tồn tại và danh sách ADB trống. Vì vậy Firebase/provider/navigation runtime trên emulator hoặc thiết bị thật vẫn `BLOCKED`; unit/build/APK không thay thế bằng chứng này.
- Restart từ `SMART_HEALTH_ACTIVE_CHECKPOINT.md`, section này, ledger mới nhất và diff/proof hiện tại. Hàng tiếp theo là **kiểm toán hoàn tất foundation Phase 2 trên Web foundation và Android native foundation**. Không kéo Dashboard, Live, Medical Records, New Scan hoặc audio từ Phase 5 lên trước; Deep Security vẫn tách riêng ở `running/preflight` và không bị chạm tới.

## 2026-08-02 handoff superseding — Web CSS A và Android adaptive foundation

- Chỉ tiếp tục **“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”**. Phase 0–1 hoàn tất, **Phase 2 đang thực hiện**, Phase 3–8 pending. Hai lát này đóng ở mức source/build/local; không đóng Phase 2 và không mở lại các hàng cũ.
- Web đã retire toàn bộ consumer production của `glass-panel`, `premium-button`, `brand-gradient-text`, `cyber-*`; Portal title trở lại `h1`, mobile chỉ ẩn context, và các surface topbar/sidebar/workspace/popover không còn backdrop blur. Active CSS graph contract chống import case/comment/`url()` bypass và khóa nợ `!important` bằng ceiling + SHA-256 multiset. Debt giảm `1,909 → 1,839`.
- Web proof: contracts `112/112`, direct local TypeScript, Vite client+SSR build, ESLint; focused final `7/7`, TypeScript `17.8s`, scoped diff check sạch; Chromium Portal `1,374` checks (`21` routes × `3` cases) và Public `5,325` checks (`22` routes × `5` viewports × `3` themes). Firefox/WebKit critical, visual snapshot và performance proof của source mới chưa chạy.
- Android giữ UI/UX native riêng: typed `Compact/NavigationRail/TwoPane`, breakpoint float `600/840dp`, font lớn rơi về single-pane, reusable list/detail/empty-detail, Clinical Patients migration, system Back, selected semantics và navigation label hai dòng.
- Android proof: `99` suites / `660/660`, AndroidTest compile, assemble và lint `BUILD SUCCESSFUL` trong `5m11s`; lint `43` warnings / `0` errors. APK `24,172,920` bytes, SHA-256 `AF2E8648AF12B2F360B1AE2FA7DEC59386C52872185D4605001BC353F800F66B`.
- Runtime/provider evidence tách riêng: `google-services.json` vắng mặt và ADB trống, nên Espresso/device/manual TalkBack/FCM/provider vẫn `BLOCKED`. P2 large-font navigation còn cần geometry/golden proof. P2 SignUp abandonment/back còn mở.
- Restart từ active checkpoint, section này, ledger mới nhất và current diff/proof. Tiếp tục giảm legacy CSS debt + cross-browser/visual/performance proof và Android resource/deep-link/testTag foundation. Không kéo Dashboard/Live/Records/New Scan/audio từ Phase 5; Deep Security vẫn riêng ở `running/preflight`.

## 2026-08-15 superseding handoff — Phase 4 source/build closed, Phase 5 active

- Chỉ tiếp tục **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–4 đã đóng ở biên software/source/build/local; **Phase 5 đang thực hiện**; Phase 6–8 pending. Không suy diễn toàn bộ kế hoạch đã PASS.
- OTA/private download đã đóng P1 cuối: deadline command được kiểm tra dưới lock/CAS trước khi đọc artifact; command chưa ACK hết delivery TTL sẽ atomically làm OTA + command `expired` và thu hồi grant; command đã ACK mới dùng execution TTL. Proof: OTA/repository `24/24`, HTTP `8/8`, ownership/storage `67/67`, backend check và diff-check PASS.
- Phase 4 Android giữ proof `109` suites / `793` tests, unit/assemble/lint PASS, APK SHA-256 `DCEEEC05251FAE3AD475F5C1F4B41CA6D43E9728AC68C961553E57F9BAF47B34`; Firebase/ADB runtime vẫn `BLOCKED`.
- Phase 4 firmware source/build PASS, RAM `52,864 / 327,680`, flash `1,120,489 / 6,291,456`; production/OTA binary Phase-4 lần lượt SHA-256 `3153F65239F9F7D9859DB2F4473AB5D879E907A4FC410E0E1CEDFE8EC0FBA582` và `2E0BF2A5440FED1FEFEDCB1DA7C6E6531FF7925B011E61293508267C48AE119B`, mỗi file `1,120,848` bytes.
- Native firmware runtime thiếu `gcc/g++`; HIL/flash/provision/audio/forced rollback **`DEFERRED — chờ phần cứng`**. Đây không phải nợ source/build và không được dùng làm bằng chứng phần cứng giả.
- Resume Phase 5 tại sáu khoảng trống đã tái hiện: canonical audio v2, finalize trước stop ACK, `audio.failed` phải interrupt, exact start/stop idempotency, restart recovery scan `created`, và Android guided/live/record boundary. Năm test Phase 5 RED giải thích run device-security `77/82`; phải GREEN trước khi Phase 5 đóng. Deep Security giữ nguyên `running/preflight`.

## 2026-08-22 superseding handoff — Phase 6 active

- Continue only **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–5 are closed at software/source/build/local gates; Phase 6 is active; Phase 7–8 are pending.
- Closed Phase 5 proof: backend `82/82 + 8/8 + 4/4 + 4/4 + 6/6`; Web clinical/live `28/28 + 12/12` plus direct TypeScript/ESLint/client+SSR build; Android `116` suites / `830` tests plus AndroidTest compile/assemble/lint and APK SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`; firmware audio-v2 build SHA-256 `CC53E0084BB699BC4787FC10DD20E1AFEC3454E46A05286DE61B56671F357EF6`.
- Phase 6 starts with an evidence-first impact inventory across appointments, consent, alerts and notifications; then closes the smallest real cross-surface gap. Keep Web/Admin and Android UI/UX independent while sharing backend lifecycle, authority, validation, idempotency and receipts.
- Firebase/provider and ADB/device proof remain `BLOCKED`; physical HIL remains `DEFERRED — chờ phần cứng`; Deep Security remains separate at `running/preflight`. Do not redo closed rows after interruption unless a current regression is reproduced.

## 2026-08-22 superseding handoff — Phase 7 active

- Continue only **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–6 are closed at software/source/build/local gates; Phase 7 is active; Phase 8 is pending.
- Phase 6 closure is real, not inferred: appointment soft-delete migration `054`, tenant/capability enforcement, exact `Idempotency-Key` replay, transactional audit and strict Web receipt are green; consent/alert/notification contracts and field-level preferences remain green.
- Latest aggregate proof: shared contracts `49/49`; Admin `183/183` plus lint/build; Android `116` suites / `830` tests plus AndroidTest compile/assemble/lint; APK SHA-256 `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`. Backend and Web Phase-6 gates are recorded in the active checkpoint and ledger.
- Resume Phase 7 with an evidence-first inventory of Admin Patients/Doctors/Devices/Packages/Storage/Audit/Export/Settings and billing summary. Fix only reproduced gaps; do not rerun or rewrite closed phases without a regression.
- Firebase/provider/ADB remains `BLOCKED`; physical HIL remains `DEFERRED — chờ phần cứng`; Deep Security remains independent at `running/preflight`.

## 2026-08-22 superseding handoff — Phase 8 active

- Continue only **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)**. Phase 0–7 are closed at software/source/build/local gates; Phase 8 is active. Never reopen a closed phase without a reproduced regression.
- Phase 7 closed the real remaining Admin list gap: Patients, Doctors, Devices, Packages and Storage now use backend search/filter/sort/pagination, truthful full-ledger facets/summaries and compatibility-preserving response bodies. Shared contracts are `50/50`; backend check/admin-list/workspace/repository gates pass; Admin contracts are `185/185`, with lint and build green.
- Resume at Phase 8 RC/demo assembly: inventory intentional source changes, run candidate build/smoke gates once, hash demo artifacts, write compatibility/deploy/rollback evidence and keep provider/ADB/HIL rows explicitly blocked/deferred where unavailable.
- Firebase/provider/ADB remains `BLOCKED`; physical HIL remains `DEFERRED — chờ phần cứng`; Deep Security remains independent at `running/preflight`.

## 2026-08-22 superseding handoff — RC2 local-demo candidate

- Continue only **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)**. Do not rebuild Phase 0–7 without a reproduced regression.
- First read [SMART_HEALTH_ACTIVE_CHECKPOINT.md](SMART_HEALTH_ACTIVE_CHECKPOINT.md), then [SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md](SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md). The next action is candidate-source/manifest finalization, not a new feature slice.
- The local demo command is `npm.cmd --prefix smart-health-embedded/web-monitor run demo:stack`; verified ports are backend/audio/Web/Admin `3765/3766/8765/8766`. Authenticated Admin and Portal doctor journeys passed and cleanup was verified.
- Current evidence is Web `390/390 + 123/123`; Admin `186/186` plus 72-route Chromium proof; backend check/base/KLT/admin-list/workspace/repositories; Android `116/830`; firmware `1.0.1` production/OTA. Exact hashes are in the RC2 manifest.
- Phase 8 remains open, but do not reinterpret an unbound RC2 shell as project-wide missing setup. Firebase Hosting/Admin, Supabase PostgreSQL/S3 and Android Firebase have retained ignored config and historical proof; Web/Admin and both known Render health endpoints currently return HTTP `200`, and a fresh read-only Firebase Admin Auth call passed. Render `/metrics` proves the backend is still the older revision because the RC2 `smart_health_legacy_*` metrics are absent. Migrations through `054`, current storage/provider/FCM delivery, online Android runtime/manual accessibility and production signing remain unverified or blocked. Physical HIL is `DEFERRED — chờ phần cứng`; Deep Security remains separately `running/preflight`.
- Latest product-source revision is `7fd905ff91208bab0d855b1ae2d15bdb5a32c3ad`. Firefox/WebKit Public `16 + 16`, Portal `463 + 463`, and local performance budgets are green; do not rerun them unless a later code change touches Web/browser behavior.

## 2026-08-23 superseding configuration-recovery handoff

- Continue only **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)** at Phase 8. Never reopen Phase 0–7 without a reproduced regression.
- The retained project checkout contains ignored, non-placeholder Web/Admin production env, two structurally valid Firebase Admin service accounts and a valid Android `google-services.json`; no secret value is committed or copied into this handoff. Firebase Admin passed a fresh read-only Auth request, while Firebase Web and Admin each returned HTTP `200`.
- PostgreSQL/Supabase and S3-compatible Storage were already implemented, configured and exercised in earlier live evidence. The current clean RC2 process simply lacks their secret env. Both known Render health endpoints now return HTTP `200`, while their old metric set proves RC2 has not been deployed; the current database/storage state and migrations through `054` must therefore be re-verified rather than rebuilt from scratch.
- Android Firebase code/config and historical emulator install/launch are real. ADB 37 and the AVD exist but no target is online now. Production release signing was not found and remains a genuine release blocker; current FCM/device/manual TalkBack proof also remains open.
- Resume by securely binding existing ignored/secret-managed configuration to the RC2 release environment, then run current read-only/live migration/storage/provider checks and cleanup-safe preview smokes. Provision only genuinely missing providers such as production signing or any selected AI/Brevo/SMTP service; never recreate Firebase/Supabase merely because the clean worktree omits secrets.

## 2026-08-23 superseding handoff — RC2 release-source gate

- Governing plan remains **[“Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware”](SHCARE_REBUILD_MASTER_PLAN.md)**. Overall status is Phase 8 active; never replace it with an 8E slice or reopen Phase 0–7 without a reproduced regression.
- Current verified product-source revision is `c1933d979db69ae8bc105489d1accdec9bfd0fe5`. A release-gate run reproduced and fixed the clean-clone `smoke:identity-migrations` failure caused by ignored `data/db.json`; the test now uses a committed synthetic fixture and all rerun backend gates pass.
- Fresh secret-free proof is green across backend, contracts, Web, Admin, Android debug and firmware production/OTA builds. Git remote push dry-run succeeds. The immediate next action is push the RC2 branch and create Firebase previews using retained external configuration, not new UI work.
- Do not merge to `main` or call production PASS until Render start mode, migrations `044–054`, database/storage/provider behavior, exact preview CORS, backup/rollback and cleanup-safe authenticated smokes are proven. Android production signing/current device proof, OTA signing/canary and Deep Security remain open; physical HIL remains `DEFERRED — chờ phần cứng`.

## 2026-08-24 superseding handoff — integration plan G3 firmware/HIL closed

- Continue [“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md). G0–G2 are closed; G3 remains active only because the durable Deep Security scan and production secure-device/provider gates are not closed. Never redo G1/G2 after restart without a reproduced regression.
- Web/Admin/backend release-source gates remain green. Shared contracts are now `51/51`; device security is `82/82`; the optional dual-slot and capture-queue telemetry fields are sanitized as bounded `uint32` through schema/OpenAPI/JSON/SQL projection.
- Firmware uses a dedicated I2S/DSP capture task, static eight-frame zero-wait queue, session-generation/ordinal fences, bounded network timeouts and exact TLS write-byte verification. Final independent review found no P0/P1; only P2 telemetry snapshot skew remains.
- Final production binary is `1,124,704` bytes, SHA-256 `A31F9F6B32AF05F253AEB5D00063F8BA0318D6C9965CB0F9EE01B9CB02E54004`; OTA SHA-256 is `ECB97D1D56561D954425365CF15E7FE35F3A7C26BDC65B659196FFB028A3A9E1`. Both validate.
- Final wired flash to the ESP32-S3 succeeded. Controlled boot HIL proved watchdog, I2S and both physical mic slots (`63/63` non-zero RMS/peak each) with no degraded/reboot marker; a separate 25-second run produced `82/82` non-zero reports per slot. See `docs/evidence/g3-hardware-01.md`.
- Production WSS/auth/command ACK/forced OTA rollback remains deliberately blocked by encrypted-NVS/device-credential/CA provisioning. Codex Security `0.1.21`, its skill and durable tools are now available and the authoritative context for scan `1b48646c-c3fe-4835-9526-92177be380ae` loaded successfully. Discovery is blocked only because the current `Full access` thread supplies `permission_profile=disabled`; switch the composer to `Ask for approval`, send a new turn and resume the same `running/preflight` scan. Never create/fail/cancel a replacement. After completion, freeze candidate SHA/inventory and enter G4.

## 2026-08-24 superseding handoff — G3 Deep Security completed

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. Overall status is G0–G2 complete, G3 in progress, G4 pending.
- Deep Security scan `1b48646c-c3fe-4835-9526-92177be380ae` completed and was sealed. Its `8` findings were remediated or revalidated with focused regression tests; do not restart or recreate that scan.
- Resume from base HEAD `1c902b29405717c28d8dfa908e4eeb16137971cc` plus dirty snapshot `dc3e7457f923ddb2483e9e12aff0a6205d58aff5`. Backend/Web/Admin/Android/firmware build gates are green; Android unit aggregate is `831/831` and APK SHA-256 is `9B58268A123FB66CFD4139CF3F47C8C13F491EAC0BE0CACDAEA416ED0D866C62`.
- Next: browser smoke for the current security diff, production/provider/DB migration preflight, freeze the exact candidate manifest, then enter G4 only when G3 PASS is reproducible. Re-detect COM/flash size before reflashing; never infer 16MB from `platformio.ini` alone.

## 2026-08-24 superseding handoff — G3 previews created, CORS blocker reproduced

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. Overall state remains G0–G2 complete, G3 in progress, G4 pending.
- Git checkpoints: integration/security commit `9a4855a4f286b77c35470dfc92e269a6504ef111`; production Auth CSS fix `927b171132d834acfe6a52bb7f3ab7e6e6d7189a`. The branch is pushed; never move the existing G3 tag.
- Firebase live Web/Admin were backed up to `backup-20260824-g3`; previews exist at the URLs recorded in `SMART_HEALTH_RELEASE_CANDIDATE_RC2_MANIFEST.md`. Web Auth preview and anonymous Admin protected-route smoke pass. No live channel was promoted.
- Exact preview-origin OPTIONS requests reproduce a live backend CORS mismatch. Continue with safe Render configuration/migration/secret recovery and authenticated preview smoke; do not merge/promote first. Secure-device WSS/auth/ACK/forced OTA rollback remains the other G3 blocker. Do not rerun completed G0–G2, Deep Security, full Android unit matrices or unchanged firmware builds without a new regression.

## 2026-08-24 superseding handoff — G3 Wi-Fi provisioning without manual JSON

- Resume only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)** at G3. G0–G2 are complete; G4 has not started. Source checkpoint: `bb8b5f4ea31e5ff6c798007d70cf1ef2dcc372a5`.
- Android now performs the native flow: scan/claim QR → request nearby Wi-Fi permission → temporarily select the ESP WPA2 setup AP with `WifiNetworkSpecifier` → GET a device-bound setup session → POST target SSID/password directly to ESP → wait for authenticated backend online presence. It does not bind the whole app process and releases the network callback on success, failure or cancellation.
- Nearby Web fallback is the ESP captive portal at `192.168.4.1`; it retains the same bounded session/CSRF/Wi-Fi validation and now uses responsive Vietnamese Shcare light/dark UI. `setup-access.json` remains an internal HIL artifact and must never be presented as the user workflow.
- Proof: Android `117` suites / `838/838`, AndroidTest compile and lint `No issues found`, APK SHA-256 `2D33500435F0B7A7A2851648D1672D6973CE3263AE2800828E4063CB61EBFFDB`; physical ESP `54/54` Unity tests; production firmware SHA-256 `5B61DDAD78613DEB6A1EB4ECFF1C2035C791666838057D5EC71AFC01551EC828`; captive-portal HIL `PASS`; application firmware restored on COM9 and both microphones still active. Manual credentials/browser controls are collapsed by default behind an explicit fallback action.
- ADB currently lists no target, and this worktree builds without `google-services.json`; do not claim App/Firebase runtime proof. The successful target-Wi-Fi POST must use a password entered by the user, never extracted from the PC. Continue G3 with an attached Android target and the existing production CORS/provider/secure-WSS/ACK/OTA blockers; do not redo this source/build/HIL row without a regression.

## 2026-08-24 superseding handoff — Android UI follows the original product style

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)** at G3. G0–G2 remain closed; G4 has not started.
- Keep all new Android functionality/security/backend/device contracts. Restore old and new screens to the original Git/Figma visual language; never replace them with an invented redesign. Keep the current Shcare signal logo. Authoritative sources: Git `2e5be444` and the RC1 `smart-health-android/figma` prototype.
- Completed in the dirty worktree: original palette/surfaces, Splash/Login/Dashboard, compact dashboard quick-action tiles and a canonical rounded blue–teal gradient app bar across new feature screens. Backend Firebase receipts now include explicit active/deleted lifecycle fields without weakening Android owner checks.
- Proof: backend runtime contract `2/2`; Android full JVM `840/840`, compile/assemble/lint PASS; physical Xiaomi integrated Firebase → backend → patient Dashboard `1/1`. Screenshot: `%TEMP%/shcare-restored-dashboard-v2.png`.
- Resume by waking/unlocking the Xiaomi and rerunning focused Compose tests individually. The latest aggregate device attempt found no Compose hierarchy because `mWakefulness=Asleep` and MIUI blocks shell input injection. Then visually inspect device/pairing/scan/appointment/notification/settings routes and continue the existing ESP32 two-mic G3 demo. Do not rerun G0–G2 or replace the restored UI source.

## 2026-08-24 superseding handoff — G3 current Web/device freeze

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. Overall status remains G0–G2 complete, G3 in progress, G4 pending.
- Current Web candidate preserves the old Web/Admin visual language and current logo while retaining all real workflows. Clean proof: Auth `390/390`, contracts `137/137`, direct TypeScript, lint, Firebase build; public LCP `668ms`, CLS `0.05436187199931413`, INP upper bound `16ms`, JS `248111` bytes and CSS `64920` bytes. The home hero now has one canonical video.
- Xiaomi ADB is now online. The production-default debug APK installed/launched and hashes to `8EB49417A11D33388D3C04BB339916ED8A7E978EDD193D5F432A531ABBC159D3`; current aggregate runtime evidence is `83` executions, `0` fail, `3` skipped. Two notification cases are MIUI-policy blocked and remain open.
- ESP32-S3 is online at current checkpoint COM9. Captive-portal HIL passes and both physical mic slots are active. The board remains `wss=0` until the user enters target Wi-Fi through App/Web; never recover the password from Windows or expose `setup-access.json` as a user workflow.
- Resume from candidate commit freeze, then complete target-Wi-Fi → authenticated WSS → command ACK → audio-v2 → durable scan, exact-preview CORS/backend migration/provider proof and signed OTA rollback/canary. Do not promote live or mark G3/G4 complete before those gates are truthful.

## 2026-08-25 superseding handoff — G3 preview proof complete

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. Status remains G0–G2 complete, G3 in progress, G4 pending.
- Product binary commit `6c6d79f67c6d03e464545d37bf50bd31a57312e2` is deployed only to preview `https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app`; branch tip `b09461428818da90e34ad05641e16a329df92a03` is test-only. Preview Home/Forgot Password proof is `102/102` across three themes.
- Final Web gates: Auth `390/390`, contracts `138/138`, TypeScript, lint, Firebase build, LCP `532ms`, CLS `0.05434283907750343`, INP upper bound `16ms`, JS `248011` bytes and CSS `64921` bytes. Do not redo this Web row without a reproduced regression.
- ADB Xiaomi, COM9 and local HIL health are online. Next action is exact-preview CORS/backend migration/provider inspection followed by user-entered Wi-Fi and authenticated ESP WSS/ACK/audio-v2/durable-scan proof. No live promotion has occurred.

### 2026-08-24 runtime continuation

- Xiaomi is awake again. Focused original-style UI runtime tests pass `4/4`; integrated Firebase Auth emulator → backend lifecycle/workspace → real patient Dashboard passes `1/1` with explicit LAN build properties.
- Full connected run discovers 80 tests: `78 PASS`, `0 FAIL`, `2 SKIPPED`. The two skipped notification-posting proofs are blocked because MIUI rejects `UiAutomation.grantRuntimePermission(POST_NOTIFICATIONS)`; keep them open for emulator/device policy proof instead of reporting a false pass.
- `PrimaryScreenThemeContractTest` now covers 19 new/extended feature screens and rejects a flat Material `TopAppBar`; they must use the canonical original-style Shcare gradient header. Patient Dashboard now labels and wraps the technical profile code instead of truncating an unlabeled identifier.
- Aggregate Android JVM gate is `118` suites / `841 PASS`, `0 FAIL`, `0 SKIP`; `lintDebug` and `assembleDebug` pass. Current production-default debug APK SHA-256 is `91D3BC26C9CEE92A8E008A91C0CBE11660F0DC329A546DDADFE9A8F180F91186`. The exact integrated-demo process tree was stopped and ports `3765/3767/8765/8766/9099` were verified free.

## 2026-08-25 superseding handoff — G3 APK install and real local admin alias

- Continue only **[“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**. G0–G2 remain closed, G3 is active and G4 is pending.
- The integrated-demo APK is installed on the attached Xiaomi. A direct Compose instrumentation login reached the real Patient Dashboard through the Firebase Auth emulator and backend. MIUI blocks ADB shell input injection, so the next QR/Wi-Fi interaction must be driven by Compose instrumentation or a physical tap; do not misreport the shell-policy denial as an app failure.
- Local Web Admin now has a real backend-authenticated alias `admin / admin` at `http://127.0.0.1:8766/login`. Browser proof is HTTP `200`, final path `/`, zero console errors. The old development fallback that navigated after failed auth is removed. The weak alias is restricted to the local demo launcher and must never be enabled in preview/live/production.
- Resume at target-Wi-Fi entry through the Android pairing UI, then prove authenticated WSS → ACK → audio-v2 → durable scan and OTA rollback. Do not redo G0–G2 or completed source/build rows without a reproduced regression.

## 2026-08-25 superseding handoff — G3 Xiaomi QR reauthorization race fixed

- The physical Xiaomi reproduced a QR-return race: Android foreground reauthorization temporarily withheld the authority snapshot after the scanner returned, so a successful backend claim receipt was shown as an expired session. The backend device remained correctly owned by the same patient/workspace.
- `DevicePairingViewModel` now waits a bounded interval for the exact authority to return. A consumed one-time QR may resume setup only when an authenticated device listing confirms the exact device, workspace and owner; another owner still fails closed. Focused tests include transient-null recovery, same-owner consumed-claim recovery and other-owner denial.
- Focused Device Pairing tests and integrated-demo assemble pass. APK SHA-256 `8AC6BF2942DEDD07425324092314B9F06CAAC2D21408C7F85E499E93B4A3DDF2` is installed. Resume by rescanning the still-valid canonical QR, then enter target Wi-Fi and continue WSS/ACK/audio-v2 HIL. G3 remains active; G4 remains pending.

## 2026-08-25 superseding handoff — G3 current-Wi-Fi prefill and live AP recovery

- Android now reads the phone's current SSID through the platform Wi-Fi APIs after an exact device claim, requests fine-location only at that provisioning step, pre-fills the target SSID, never overwrites a user-edited value and keeps manual entry available when Android redacts the network name or permission is denied. Target Wi-Fi passwords remain memory-only and are never added to source, commands, logs or handoff artifacts.
- Fresh proof is `118` JVM suites / `849/849`, AndroidTest compilation, integrated-demo assemble and lint PASS. The installed APK is `26,959,593` bytes with SHA-256 `D1309E2C1793717453DE5610EFE4824A589EFD69FEFA819F58F980E888DC53FF`.
- Xiaomi/MIUI blocks shell and UiAutomation runtime-permission grants, so the user must approve the normal in-App location prompt. This is an operating-system interaction requirement, not a source PASS. The gated physical SSID HIL must be rerun after that approval.
- COM9 was re-detected and the ESP was reset into the application firmware. Serial and WLAN discovery confirm the setup AP is active and its SSID exactly matches the canonical QR; both I2S slots emit samples. The earlier Android `onUnavailable` happened before the AP was active. Resume with one physical QR scan and password entry, then run authenticated WSS → command ACK → audio-v2 → durable scan and OTA/rollback proof. G3 remains active; G4 remains pending.
## 2026-08-25 — G3 Xiaomi SSID và route-loading checkpoint

- Tiếp tục đúng kế hoạch `Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare`; G0–G2 giữ nguyên `complete`, G3 vẫn `in progress`, G4 chưa bắt đầu.
- Xiaomi tái hiện việc không lấy được SSID trong khi quyền Wi-Fi/vị trí đã được cấp nhưng dịch vụ Vị trí hệ thống đang tắt. Android nay phân biệt `LocationDisabled`, giải thích đúng lý do, mở cài đặt Vị trí bằng một chạm và tự đọc lại SSID khi quay về; nhập tay vẫn là fallback.
- Đã bỏ timer reauthorization chặn toàn màn hình mỗi 30 giây trên cùng route — nguyên nhân của màn “đang xác minh” chớp tắt. Fail-closed vẫn giữ khi foreground lại app, chuyển protected route, authority stale tại lần compose, đổi auth session/workspace, backend reject hoặc authorization event.
- Gate nguồn mới: `118` JVM suites / `850/850`, AndroidTest Kotlin compile, lint và assemble PASS. APK LAN-integrated SHA-256 `E4A1ECDACF98ED6DB32B4B248D7152EC38B7C47383E54DF524A5171840159D0B`, `26,961,117` bytes, đã cài trên Xiaomi.
- Runtime UI test chưa được tính PASS: Xiaomi đang secure-locked nên Compose không có hierarchy; MIUI cũng chặn shell bật Vị trí/cấp quyền. Khi mở khóa máy, tiếp tục ngay từ bật Vị trí/quyền trong App → `CurrentWifiSsidHilTest` → QR/provision → WSS/ACK/audio-v2/durable scan. Không đưa mật khẩu Wi-Fi vào source, lệnh, log hay tài liệu.

## 2026-08-25 superseding handoff — G3 BLE-first provisioning checkpoint

- Continue only [Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md): G0–G2 complete, G3 active, G4 pending.
- Source: `DeviceBleProvisioningContract.kt`, `DeviceBleProvisioner.kt`, `DevicePairingViewModel.kt`, `DevicePairingScreen.kt`, Android manifest and firmware `MSM261S4030H0/src/main.cpp`.
- Contract: QR PoP plus a per-read nonce derives AES-GCM; the bounded envelope is identity/nonce bound; firmware acknowledges before reboot. The BLE advertisement discriminator is opaque SHA-256 data, not a raw device ID. Setup AP is recovery-only.
- Proof: Android `119/857`, lint, assemble; firmware development/production builds pass. Debug APK `5FC56B9EC5E927E9EA02B4E803C852EB53FE1AC705EBC7590F886C60F2A6677D` is installed; development firmware `3446A13296D2D675524FCB3E0E24F05CE5C341ECA235CC8757E620B2E6B2CE33` flashed to COM9, serial shows BLE ready and both mics.
- BLOCKED, not PASS: server connection prevents authenticated App entry; Windows scanner returns `0x800710DF`. Resume only after backend reachability and Nearby Bluetooth permission, then prove BLE -> WSS/ACK/audio-v2/durable scan/OTA.

## 2026-08-26 superseding handoff — Device-ID + SoftAP demo flow

- User workflow is now: enter only the company-assigned Device ID → the backend confirms the already-authorized device → open **Kết nối Wi-Fi** from that device's settings → Android requests only the required runtime Wi-Fi/location permissions and temporarily joins the ESP SoftAP. QR, claim code, setup SSID and setup password are no longer presented in the main app UI.
- Backend `POST /api/v1/devices/{id}/setup-session` is authenticated and manager-scoped. It rejects an unassigned device, derives SoftAP material only from server-side verification material, returns it only to the current in-memory App session, and writes an audit access-log entry without a credential.
- Evidence: backend syntax/check PASS; device setup/security suite `62/62` PASS (including assigned-device and secret-redaction checks); Android `compileDebugKotlin`, unit-test compilation, AndroidTest compilation, focused `DevicePairingViewModelTest`, and `assembleDebug` PASS. Current debug APK is installed on the Xiaomi; local integrated stack ports `3765/3767/8765/8766` are listening.
- Runtime visual runner was attempted but MIUI held the Notification Shade/secure surface and blocks shell input injection. This is not a source failure and must not be counted as a HIL pass. G3 remains active; G4 has not started. Remaining physical evidence is SoftAP target-Wi-Fi submission, WSS presence, ACK, audio-v2, durable scan and signed OTA rollback.

## 2026-08-28 superseding handoff — production email verification fixed

- The physical Xiaomi account had already been verified by Firebase. A token-refresh HIL reproduced the real failure at Render `/api/v1/auth/firebase`: PostgreSQL `23514` at `create_patient_identity`, constraint `patients_blood_type_check`.
- Root cause: the first-login patient bootstrap wrote an unspecified blood type as `""`; the production schema accepts only `NULL` or a canonical blood type. `queryUpsertPatient` now persists the absent value as `NULL`, and the repository smoke asserts that exact SQL parameter.
- Production Render now serves commit `91dec1f4e93e`. The same authorized Firebase session on Xiaomi passes the production backend HIL `1/1` after the deploy. The existing main APK already points to this backend, so no main-APK replacement was required; the Android test APK was refreshed with an explicit opt-in, token-redacting HIL probe.
- Verified gates: backend `npm run check`, repository smoke, focused Android Email Verification repository/ViewModel tests, AndroidTest assembly, and physical production auth HIL. MIUI is currently secure-locked, so no new visual/TalkBack claim is made.

## 2026-08-29 superseding handoff — durable Admin mutations, Brevo and hot-path latency

- Production Render serves `080cc60cd7ad`; Firebase Admin serves the matching notification/settings UI. Doctor approval was repaired at the SQL transition boundary and the formerly failing request now leaves Pending; live Admin shows Pending `0`, Approved `3`, Rejected `2`.
- Notification read-all/delete-all now use one audited SQL transaction and return canonical server state. Live proof: total `10`, unread `4 → 0`, then a full reload remained unread `0`. Runtime blob writes were removed from the SQL path.
- Workspace/platform settings and profile changes now persist through canonical SQL repositories. Migration `056_durable_runtime_settings.sql` adds `organizations.settings` and singleton `platform_settings`; `/api/settings` no longer bypasses that repository.
- Brevo admin email fanout is restored. A production message to the authorized account is recorded by Brevo as Sent, Delivered and Opened. Delivery retries use one UUID idempotency key and retry only transient network/408/425/429/5xx failures; secrets and recipient content are not logged.
- Authenticated SQL reads no longer rewrite the encrypted monolithic runtime snapshot on every request. Warm production reads now measure about `1.38–1.80s` instead of repeated `2.3–6.9s` waits; authorization, session revocation and tenant checks remain fail-closed.
- Semantic Admin toasts now use colored success/error icons. Android notification/profile/preferences contract tests pass; firmware protocol was untouched, so no firmware flash is required for this server/Admin durability slice.

## 2026-08-29 superseding handoff — truthful Brevo campaign delivery

- Production campaign email now excludes placeholder/non-routable recipients (`.test`, `.invalid`, reserved example domains and malformed addresses) before enqueueing. An email-only campaign with no deliverable recipient fails with HTTP `409` instead of pretending to send.
- Backend stores only Brevo provider metadata and `messageId`, then reconciles delivery events through a tenant-scoped campaign refresh endpoint. Provider acknowledgement, delivered, deferred, bounce, blocked and failed are no longer collapsed into a generic success state.
- Admin now requires an explicit workspace for platform-wide operators, previews the exact recipients and excluded count, locks duplicate submit synchronously, polls delivery for a bounded interval and exposes a manual refresh action. Each ledger row identifies its recipient, so two recipients cannot be mistaken for a duplicate send.
- Production code commit `6e71d72cc6f5` is live on Render. Firebase Admin bundle `e3b659f974e8801a`, release `1787944371865000`, is live at `https://shcare-admin.web.app`.
- Live canary `notification_campaign_20260828191859_a8dd8254` targeted exactly one eligible account (`baobee44@gmail.com`) on the email channel only. Admin changed from `Email: 1 provider đã nhận` to `Email: 1 đã giao`; Brevo recorded one Sent and one Delivered event for the same message, with zero bounce. Production demo cleanup removed four verified `.test` fixture accounts and eight smoke notification rows while preserving real data. Regression gates pass: Admin `196/196`, lint/build; backend campaigns `14/14`, inbox `10/10`, preferences `20/20`, aggregate check and public deployment smoke.

## 2026-08-29 superseding handoff — Brave public motion override

- Brave reproduced `prefers-reduced-motion: reduce`; the live Public shell disabled the motion button, so the user could not opt back in even though Chrome worked normally. This was an App policy defect, not blocked JavaScript or a missing asset.
- Public motion now has `system|enabled|reduced` preference semantics: first visit respects the operating system, while an explicit click can enable or disable motion and remains persisted. The control is never disabled and explains the system-reduced state accessibly.
- Reduced-motion CSS now remains authoritative only until the user explicitly selects `enabled`. Home/video and reveal transitions then use the intended bounded motion; local Brave-style proof measured `0.42s` rather than the prior near-zero duration.
- Commit `4d00442d` is live at `https://shcare.web.app`; Firebase version `161c20b8df24d7d5`, release `1787946098589000`. Contracts, lint, Firebase build and the focused reduced-motion browser smoke (`23` checks) pass; live Brave UI toggled reduced → enabled with no console warnings/errors.

## 2026-08-31 superseding handoff — Platform Admin data control and UTF-8 repair

- Production backend and Admin now expose audited controls for device inventory metadata, exact-workspace patient assignment/unassignment and Platform-Admin-only workspace transfer. Device telemetry, credentials, passwords, tokens and clinical provenance remain device/provider controlled and cannot be forged through an Admin form.
- Doctor profile administration now covers the complete supported profile contract: name, phone, title, address, licence, workplace, department and specialty. Workspace access remains a separate guarded operation that refreshes claims and revokes stale sessions.
- Runtime mojibake was removed from Admin/backend, and corrupted Vietnamese test fixtures in Web/Android were corrected. Admin, Web and backend now have source-level UTF-8 regression gates; the four production/source trees scan clean except for the detector regex itself.
- Render production serves release `b3a181af57aa` at `https://shcare-api-prod.onrender.com`; health is HTTP `200`, Admin CORS preflight is `204`, and an unauthenticated device mutation is rejected with `401`. Firebase Admin version `51d345c520cfc96e`, release `1788156866635000`, is live at `https://shcare-admin.web.app`.
- Verification: Admin contracts `200/200`, lint and Firebase build PASS; Web contracts/lint/build and focused Auth `49/49` PASS; backend check, UTF-8 gate and device-security suite `85/85` PASS; focused Android unit suites build PASS. Live asset inspection downloaded `177` bodies and found all three new controls, the correct backend URL and no `thiáº¿t bá»‹` string.
- No interactive browser was connected for a fresh authenticated screenshot/TalkBack pass. Do not reinterpret the asset/API proof as an authenticated visual HIL; the data and security contracts themselves are deployed and verified.

## 2026-08-31 superseding handoff — canonical account and notification authority

- Admin and Portal account reads now use the canonical `/api/v1/me`, `/api/v1/auth/sessions`, `/api/v1/me/2fa` and `/api/v1/me/notification-preferences` authority. Admin profile/avatar mutations bind idempotency to the exact user, workspace and auth session, validate the receipt, then read `/api/v1/me` back before reporting success or refreshing the shared header avatar.
- Admin's top-bar and notification center now read the personal `/api/v1/notifications/inbox` instead of the campaign-recipient ledger. Creating a campaign no longer injects every recipient row into the operator's inbox, so a two-recipient campaign is not displayed as two duplicate sends.
- Read, read-all, delete and delete-all use stable idempotency keys and replace local state only with the backend-confirmed inbox snapshot. The new `DELETE /api/v1/notifications/inbox` transaction is owner/workspace scoped, audited, replay-safe and leaves other accounts/workspaces untouched.
- Verification passed: Admin contracts `203/203`, lint and Firebase build; Web contracts `141/141`, Auth `390/390`, lint and Firebase build; backend aggregate plus notification inbox/repositories/workspace/device/avatar/overview/campaign/preferences/persistence/release-security gates; Android unit/lint/assemble; firmware production and OTA builds.
- Physical verification remains honest: ADB currently reports no Xiaomi and Windows reports no COM port, so no fresh install, TalkBack, serial, WSS/audio or OTA HIL claim is made. Firmware native Unity is also blocked locally because system `gcc/g++` is absent; the ESP32 production binaries themselves build successfully.

## 2026-09-02 superseding handoff — assigned-doctor device access and Wi-Fi provisioning

- The doctor dashboard device card was incorrectly routed through a `workspace.devices.manage` guard even when Admin had already assigned the device and the session correctly carried `workspace.devices.view`. This produced the native “Không có quyền mở màn hình này” screen before device data could load.
- Android device details and the ESPTouch result route now accept the existing device-view authority. The selected assigned user may see device health and open `Kết nối Wi-Fi`; Add, release and ownership-transfer surfaces remain hidden unless the session has a device-manage capability.
- Backend SmartConfig setup now permits the exact `ownerUserId`/`pairedUserId` with tenant-scoped device view authority, or an existing device manager. A same-workspace doctor who is not assigned that device receives `403 DEVICE_WIFI_SETUP_FORBIDDEN`; ownership mutations still use `assertCanManageDevice`.
- A production canary then exposed a second mismatch: Platform Admin correctly persisted the responsible doctor while the ownership lifecycle label was `unassigned` (meaning no patient was assigned yet), but setup-session accepted only the older `claimed` label. Setup now requires the canonical owner/paired principal instead of conflating doctor ownership with patient assignment.
- Evidence: backend device-security `86/86`, backend syntax/aggregate smoke, Android full unit/build/lint, AndroidTest compilation, and three focused Compose tests on Xiaomi `21081111RG` all pass. The debug APK was installed in-place with SHA-256 `2750938E7064B305E43B5E4E36104193127DA99E2005CA9915790E9370B95E96`.
- Render serves `bcf42562ab7c`. Public deployment smoke passes, and an authenticated production canary for doctor `usr_20260828091945_bf3c594e` plus assigned device `shcare-g3-prod-demo` receives HTTP `200`, protocol `2`, transport `esptouch_v2`, security `aes128` without exposing provisioning material.
- The exact physical doctor journey now passes `1/1` on Xiaomi: authenticated dashboard → device card → device settings → `Kết nối Wi-Fi` → native Wi-Fi surface. The same test proves Add and release are absent. The Firebase session was restored with a one-use custom token held only in app-private storage; the token file was deleted before exchange and was never supplied through test arguments or logs. The test APK was removed, the normal App relaunched, and the signed-in doctor dashboard is present on-device.

## 2026-09-04 superseding handoff — mobile AI/voice and startup availability

- Android AI Assistant now has a provider-independent speech seam, native Vietnamese speech recognition, a live amplitude waveform, stop-to-draft behavior, explicit user-confirmed send, private image/file attachments and tenant/user-scoped conversation history. Stopping speech never sends automatically. The same routed experience is available to patient and clinical roles; authorized backend context remains limited to the active account/workspace and recent permitted health records.
- Physical Xiaomi Compose proof is `3/3`, including the complete voice boundary: partial transcript plus amplitude bars → stop → final text in the composer → zero repository sends until the user presses Send. Android full unit tests, lint and debug assembly pass. The currently installed debug APK is SHA-256 `BD4C50BF8AB74E0BF8FB7AA1D84D0DAEEB19700D77BCBA733B93E2B206AB7BDA`, version `1.0.0-rc.2`.
- The recurring startup “Không thể kết nối máy chủ” was reproduced while the phone itself had validated Internet. An opt-in in-app HIL call proved the exact configured Render health path succeeds. Root cause was the splash screen gating even a signed-out user on a transient backend health probe. Signed-out startup now goes directly to Login; an existing Firebase owner remains fail-closed through health, token, reload and backend exchange boundaries. Focused bootstrap unit tests and both production health/bootstrap HIL probes pass.
- Backend AI/audio gates remain green: AI chat `12/12`, audio protocol `4/4`, audio worker `6/6`, aggregate `npm run check`. Render currently reports release `git-329c998160ff`; live backend, Admin Hosting and Web Hosting return HTTP `200`.
- Firmware production build for `esp32-s3-devkitm-1` passes at 17.0% RAM / 18.8% flash; artifact SHA-256 remains `8A03810928FF8FE70F42B3191A1C3835EB4A3430DEDB81963F4B1F6FCAB740D9`. COM9 is visible as CH343. No new flash was performed because the generic build does not contain the currently enrolled production identity/CA material; a bounded read produced no new runtime lines. Do not convert source/build or old telemetry into a fresh WSS/audio/OTA HIL claim.
- Admin and Doctor Portal contract/lint/Firebase builds pass. The workspace/business Portal expansion is intentionally recorded as future scope; the current completion target is the doctor Portal plus Platform Admin. External AI inference is intentionally `BLOCKED` until an approved provider/model endpoint and secret are configured; attachment storage/history/fail-closed authorization remain functional without pretending that an unconfigured model analyzed a file.

## 2026-09-05 superseding handoff — guided scan recovery and medical-record UX

- Guided scan start no longer performs a redundant preflight device reload. The backend remains the atomic authority and now returns stable `DEVICE_NOT_AUTHENTICATED`, `AUDIO_SESSION_ALREADY_ACTIVE` and `AUDIO_START_DELIVERY_FAILED` codes; Android distinguishes device presence from transport/backend conflicts and retries only ambiguous transport failures with the same idempotency key.
- Every backend interruption with the original authenticated device session still present sends a durable `audio.session.stop` before cleanup. A five-minute bounded recording lease prevents a killed client from leaving an indefinite cloud audio stream. Reconnect sessions are identity-bound so an old stop cannot race into a new authenticated session.
- Medical records no longer poll HTTP/PostgreSQL every five seconds. Doctor and patient now share one pull-to-refresh surface; the share-target picker starts collapsed, preserves a 48dp target and collapses after selection so record details remain visible.
- Evidence: backend `npm run check` PASS and device/OTA/security `89/89` PASS; focused Android records/start-scan tests PASS; Android `assembleDebug` and `lintDebug` PASS. APK SHA-256 `B8F39BB61E04532EDEC310FDDF7A3692CA062653E7BED2832A0DB3D0F4252A9A` is installed on Xiaomi `21081111RG`, version `1.0.0-rc.2`. Firmware source contract and production target build PASS; candidate firmware SHA-256 is `96A1E0A66D4EF856118249BF4E15B252A118C8F8C4F945C9BD816864F6E75CCA`.
- COM9 is present. A bounded serial read shows the cloud frame counter stationary at `457750` while local I2S continues, proving the prior orphan stream is no longer consuming WSS bandwidth. Mic slot 0 has signal while slot 1 is near silence; two-mic HIL therefore remains open. The Xiaomi display is currently asleep and MIUI rejects shell input injection, so no fresh visual/TalkBack PASS is claimed.

## 2026-09-05 superseding handoff — production guided measurement PASS

- The first physical retry exposed two PostgreSQL normalization defects, not an ESP offline condition. `queryUpsertDeviceCommand` passed blank optional lifecycle timestamps to `timestamptz`; after that repair, `upsertScanSql` still passed blank `startedAt`/`endedAt`/`createdAt`. The latter terminated the Node process while PCM was arriving, and the Android HTTP `429` was a transient consequence of Render restarting.
- Commit `cc349bddfeab` fixed durable command timestamps. Commit `cdf08214c83d` normalizes every optional timestamp in the affected patient/device/scan/audio/AI/event writes and adds a PostgreSQL regression assertion. Render deploy `dep-dadp23942hec73bpblsg` is `live`, `/api/health` reports `git-cdf08214c83d`, public deployment smoke passes, and post-deploy Render error logs are empty.
- The explicit physical Xiaomi HIL now passes `1/1`: authenticated doctor -> online device -> start ACK -> audio-v2 PCM -> eight-second capture -> explicit stop -> durable finalize -> waveform -> authenticated WAV download. Production scan `scan_20260905035023_04e2906f` is `completed` at `8.392 s`, `134272` samples at `16000 Hz`, with a 128-point waveform and an audio object.
- Independent in-memory WAV inspection confirms `268588` bytes, `134272` PCM samples, peak `5307`, RMS `1166.79` and zero-crossing rate `0.01447`; no bearer, credential or raw audio was written to logs. Four exact interrupted records created by the failed attempts were deleted with HTTP `200`; the completed HIL record remains as evidence.
- COM9 opens at 115200 and continues reporting WSS/audio diagnostics. Slot 0 carries strong signal; slot 1 remains mostly RMS `31-190` with occasional higher activity. Firmware correctly selects one healthy slot and the durable mono recording is usable, but two-physical-microphone acceptance remains open pending SEL/wiring/acoustic verification. The enrolled board was not overwritten by the generic credential-less firmware image.
- Medical-record refresh remains user-driven and the recipient selector remains collapsed for both patient and doctor. Source/UI tests, assemble/lint and the installed APK cover this change, but MIUI still blocks shell input injection for a fresh records-screen TalkBack traversal; do not reinterpret the successful audio HIL as that visual-only gate.
- A fresh Supabase security-advisor read at `2026-09-05T04:00:55Z` reports no `rls_disabled_in_public` finding for `patient_import_batches`. It reports 46 `INFO` rows for backend-only tables with RLS enabled and no client policy, plus four `WARN` rows for mutable function `search_path`: `prevent_audit_log_mutation`, `validate_audit_actor_on_insert`, `enforce_active_doctor_access_identity` and `revoke_patient_access_on_doctor_demotion`. No production DDL was changed in this audio slice; fix these through a reviewed migration with trigger/tenant regression proof.

## 2026-09-06 superseding handoff — session takeover, mic-quality warning, uncommitted DSP/UI slice

- Takeover from Codex session `01a039de` (25/08–06/09). Last pushed commit is `07410e5c`; the entire 2026-09-06 slice remains uncommitted in the working tree: Android white-theme + ChatGPT-style pill composer remake, firmware DSP overhaul (heart 25–250 Hz / lung 80–2000 Hz, slot-signal classification, AGC gated on biological signal), `audioSignalQuality` telemetry plumbing and a Gradle wrapper bump. Commit these as focused slices before further work; never `git add -A` wholesale and never flash a generic artifact onto the enrolled board.
- Firmware truthfully reports `audioSignalQuality: too_weak` on COM9 after the 06/09 flashes (NVS/eFuse preserved). Software classification is done; the remaining blocker for real heart/lung audio is the physical signal path (slot 0 healthy but weak, slot 1 near-silent). Do not amplify noise in software to fake signal — inspect capsule/wiring/3.3 V/CHIPEN/SEL first.
- Android now surfaces mic quality: `SmartDeviceTelemetry.audioSignalQuality` → `DeviceHealthSnapshot.audioSignalQualityKind` (`detected|too_weak|clipped`), warning notice + metric in the device health panel, advisory-only (never downgrades presence). Gates at takeover: JVM `893/893`, androidTest compile PASS (new panel tests pending physical run).
- Still open and blocking thesis demo/G4: physical mic repair; Wi-Fi re-provisioning into an available 2.4 GHz network via the App secure field (`Louisnguyen` returns `201 NO_AP_FOUND`); approved AI provider on Render (`AI_PROVIDER_ENDPOINT/API_KEY/MODEL`); signed OTA/rollback on the enrolled board; spoken TalkBack traversal (MIUI blocks ADB).

## 2026-09-06 superseding handoff — Codex continuation after Claude takeover

- Claude's six focused commits `afbf1d5d..2635a8b7` are present on local `main`; the older note saying the UI/DSP slice is uncommitted is historical. Codex closed the interrupted Compose assertion, included the omitted `AIAssistantComposerContractTest`, removed the five reported lint causes and left unrelated untracked user files untouched.
- Current Android proof: JVM `124` suites / `893/893`, lint `0` actionable issues, assemble/androidTest compile PASS. Final debug APK `48,793,374` bytes, SHA-256 `A1483FF6693ADDF378CB880B465C76CE382FF59F3183B11EBADECB8C6F4E8C6D`, installed on Xiaomi `21081111RG`; device-health plus AI-composer instrumentation `10/10` PASS and bounded launch has no crash.
- Current device proof: firmware source/golden `4/4`, backend device-security `65/65`; fresh COM9 serial joins Wi-Fi and reaches `Cloud device authentication accepted over WSS`. After boot transients, both mic slots remain near the noise floor (raw RMS mostly `15-65`) and are truthfully classified `audioSignalQuality:too_weak`.
- Do not claim heart/lung capture complete. The remaining acceptance gate is physical and must produce repeatable `detected` signal under actual chest/lung coupling; verify the two capsules, per-mic power/CHIPEN/SEL, shared SD path and acoustic head. Approved AI provider and signed OTA/forced rollback also remain open, so G3 is PARTIAL and G4 is still gated.
- Source/deploy continuation: verification commit `fd48565608cd6c2f0843d74604ae6bd39cbb5d4e` is pushed to `origin/main` and is LIVE on replacement-account Render service `srv-daa666on74is739va12g`. Public health returns release marker `fd48565608cd`; Admin and Portal production origins pass exact CORS reflection, an invalid origin is not allowed, and deploy logs show PostgreSQL plus Firebase production auth started without an error. A later ADB re-probe found no attached target after restarting the local ADB daemon; retain the earlier same-session Xiaomi `10/10` evidence but do not claim a new post-deploy phone run.
