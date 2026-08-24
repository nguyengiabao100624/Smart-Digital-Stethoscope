# Shcare 1.0.0-rc.2 release candidate manifest

Release label: `Shcare 1.0.0-rc.2`

Baseline revision: `fdeb1f8783827c6493534b9083858ccc113ee8da`

Verified product-source revision: `927b171132d834acfe6a52bb7f3ab7e6e6d7189a`

Prepared: `2026-08-24` (`Asia/Saigon`)

Integration candidate status: `G3 in progress; source/build/security/browser and
dual-microphone capture checkpoints are frozen, while production CORS/provider
and secure-device WSS/ACK/OTA proof remain open`.

Governing plan: **[Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát
hành Shcare](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)**.

This manifest binds the Phase 8 local demo/release-candidate evidence to one
intentional product-source commit. It does not claim that this RC2 revision has
been promoted, that current provider delivery has been re-proven, that Android
has production signing/current runtime proof, or that firmware production
WSS/command/OTA rollback has been proven. Physical two-slot I2S/serial HIL is
now proven separately. Earlier Firebase/Render/Supabase setup and deployment evidence remains
valid historical evidence and must not be reclassified as "never configured"
only because a clean worktree or its current shell omits ignored secrets.

## Candidate scope

Included canonical source:

- `docs/**` for the named plan, checkpoint, release evidence and thesis handoff.
- `packages/shcare-brand/**` and `packages/shcare-contracts/**`.
- `smart-health-web/**`.
- `smart-health-admin/thiết kế giao diện/**`.
- `smart-health-android/**`.
- `smart-health-embedded/web-monitor/**` and
  `smart-health-embedded/MSM261S4030H0/**`.

Excluded local/generated/secret state includes dependency directories, build
caches, `.codegraph`, `.codebase-memory`, runtime JSON data, `.env` secrets,
Firebase service accounts, `google-services.json`, Android release keystores,
firmware device credentials and OTA private keys. Generated artifacts are
hashed below but are not used as source identity.

The source candidate must be staged with the exact allowlist above; `git add
-A`, reset, stash-all and force-push are prohibited. Final staged inventory,
secret-pattern scan and `git diff --check` are rerun before the product-source
commit is accepted.

## Version and compatibility matrix

| Surface | RC2 version | Canonical contract | Compatibility verdict |
| --- | --- | --- | --- |
| Backend | package `0.2.0`, release label `1.0.0-rc.2` | HTTP `/api/v1`, authenticated WSS, migrations through `055` | Additive migration and compatibility-window aliases retained |
| Public/Auth/Portal | `1.0.0-rc.2` | Route/capability/state contracts and strict backend receipts | Compatible; no mutation success before a validated backend outcome |
| Platform Admin | `1.0.0-rc.2` | Independent Admin route/capability and real list/mutation APIs | Compatible and independently deployable/rollbackable from Portal |
| Android | `versionCode=3`, `versionName=1.0.0-rc.2` | Native typed routes, repositories/ViewModels and shared HTTP/WSS schema | Backend-compatible; UI/UX remains native and separate from Web |
| Firmware | `1.0.1` | authenticated device command v1, audio v2, bounded capture queue and OTA lifecycle | Physical ESP32-S3/two-mic capture is proven; production cloud/OTA remains gated by secure provisioning |
| Brand | `@shcare/brand@0.1.0` | React-free Web/Admin tokens, fonts and SVG | Web/Admin only; Android uses `ShcareMobileTheme` |
| Shared schemas | `@shcare/contracts@0.1.0` | HTTP v1, device command/event and audio v2 fixtures | Source/build fixtures agree across consumers |

Database migration `054_appointment_soft_delete.sql` is additive and covered
by local repository/contract tests. No claim is made that migrations have run
against candidate or live PostgreSQL.

## Local demo proof

Run from the canonical repository root:

```powershell
npm.cmd --prefix smart-health-embedded/web-monitor run demo:stack
```

The launcher creates isolated temporary JSON data, starts backend/audio/Web/
Admin on `127.0.0.1` ports `3765/3766/8765/8766`, waits for readiness, and
prints local-only demo credentials. The verified run returned HTTP `200` for
backend, Web and Admin; Playwright completed one real Admin login and one real
Portal doctor login. Ctrl+C released all four ports and removed the temporary
demo directory. Local demo auth is explicitly unavailable in production.

Demo accounts:

- Patient: `patient@example.com` / `12345678`
- Doctor: `doctor@example.com` / `12345678`
- Platform Admin: `admin.demo@shcare.local` / `Shcare-Demo-2026!`

## Verification evidence

### Web/Portal

- Auth/component suite: `63` files, `390/390` tests.
- Contract suite: `123/123`.
- Direct local TypeScript, ESLint and Vite client/SSR build: PASS.
- `bun audit`: `No vulnerabilities found` after compatible transitive pins and
  React Router `7.18.2`; all affected gates passed again.
- Local demo readiness and doctor-login journey: PASS.
- Public cross-engine critical checks: Firefox `16` and WebKit `16` on
  representative desktop-light/phone-dark home journeys.
- Portal cross-engine critical matrix: Firefox `463` and WebKit `463` checks,
  each covering `21` routes in one phone-light or desktop-dark case. A missing
  avatar-cleanup fixture was reproduced as a 404, fixed with the exact
  owner/workspace-bound contract and rerun green.
- Local production-preview performance PASS: load `113ms`, transfer `346,058`
  bytes, JavaScript `200,809` bytes, LCP `400ms`, INP `56ms`, CLS
  `0.0003938633`; all configured budgets passed.
- Current G3 generated `dist` tree SHA-256:
  `D3ADA8977F812A8A3636DB06D40B6A43EEA4C09ED624FE6FA31B609F585723F9`.

### Backend

- `npm.cmd run check`, base smoke and KLT contract smoke: PASS.
- Shared contracts: `51/51` after additive dual-slot/capture-queue telemetry.
- Phase 7 admin-list contract: `3/3`; workspace-access and repository gates:
  PASS.
- `npm audit`: `0 vulnerabilities`.
- Production-readiness preflight correctly rejects the current machine because
  required live credentials/infrastructure are absent; that result is recorded
  as a release blocker, not converted to a failure of local source/build proof.

### Platform Admin

- Contract suite: `186/186`; ESLint and Vite client/SSR build: PASS.
- Full local Chromium route matrix: `72` route/viewport/theme checks plus real
  patient create/update/delete, notification mutations, audit metadata, CSV
  download and cleanup. Result: zero axe serious/critical, console/request
  error, unauthorized request, overflow/theme/provider drift or target below
  `44px`.
- `npm audit`: no high/critical; one low development-only `tsx/esbuild`
  Windows development-server advisory remains. The static production artifact
  does not expose the development server.
- Current G3 generated `dist` tree SHA-256:
  `04718B8FC2ACE54224CC3A274F2702F6E46A8271F5BC6206A3791B21746D135F`.

### Android

- Retained exact-current aggregate proof: `116` suites / `830` JVM tests;
  AndroidTest Kotlin compile, debug assemble and lint: PASS.
- Debug APK: `26,948,657` bytes; SHA-256
  `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`.
- This is debug/source-build proof. The ignored production
  `google-services.json` exists in the retained project checkout but is not
  present in this clean RC2 worktree; ADB currently has no online target.
  Historical emulator install/launch evidence exists, while current RC2 FCM,
  production signing and manual TalkBack/physical-device proof remain absent.

### Firmware

| Profile | Version | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `esp32-s3-devkitm-1` production | `1.0.1` | 1,124,704 | `A31F9F6B32AF05F253AEB5D00063F8BA0318D6C9965CB0F9EE01B9CB02E54004` |
| `esp32-s3-ota` build | `1.0.1` | 1,124,704 | `ECB97D1D56561D954425365CF15E7FE35F3A7C26BDC65B659196FFB028A3A9E1` |
| `esp32-s3-development` | `1.0.1` | 1,125,888 | `3A2D09EE57B5F020B6C3BBBF5649C0AA753560F87267FF55DBBBF95B4499AC8D` |

All three PlatformIO builds pass. Production reports RAM `55,200 / 327,680`
and linked flash use `1,124,333 / 6,291,456`. Esptool identifies the physical
target as ESP32-S3 revision 0.2 with 16 MB flash and 8 MB PSRAM; image checksums,
validation hashes and the dual-OTA partition boundary are valid.

The final production image was wired-flashed to `COM9`; every written region
was hash-verified. A controlled 20-second boot capture proved the built
five-second watchdog, I2S readiness and `63/63` non-zero RMS/peak reports for
both hardware slots with no degraded/unavailable/reboot marker. A separate
25-second stable capture produced `82/82` non-zero reports per slot. Aggregate
diagnostics retain no raw PCM, credential, network identity or PHI. Evidence:
[G3 ESP32-S3 dual-microphone HIL](evidence/g3-hardware-01.md).

The capture task owns I2S/DSP and uses a static eight-frame, zero-wait queue;
the loop task alone owns WSS/UDP. Production WSS connect/I/O/TLS timeouts are
bounded below the watchdog. Exact TLS byte count is checked before incrementing
`wsPacketsSent`; partial writes close the socket and reset authenticated audio
state. Independent final review reports no remaining firmware P0/P1. Production
WSS/auth and forced OTA rollback remain blocked by the deliberate
`CREDENTIAL_STORAGE_ENCRYPTION_REQUIRED` gate until encrypted NVS/device
credential/CA provisioning exists; no insecure define or irreversible eFuse
operation was used.

## Configuration recovery audit

Read-only recovery audit on `2026-08-23` corrected the scope of the original
promotion blockers without copying or committing secrets:

- The retained project checkout has ignored Web/Admin production env files,
  structurally valid Firebase Admin service accounts and a structurally valid
  Android `google-services.json` whose package matches the app. A read-only
  Firebase Auth request succeeded from the RC2 source using the retained local
  service-account path.
- Firebase Hosting is configured for the Web and Platform Admin targets. Both
  deployed sites returned HTTP `200` during this audit, and earlier deployment
  IDs and mutation-smoke evidence remain recorded in the handoff documents.
- Supabase PostgreSQL and S3-compatible Storage have implementation and prior
  setup/live-smoke evidence. This does not prove that migrations through `054`
  or the current RC2 storage flows have run against the live environment.
- The current RC2 process does not have the production database, storage,
  provider or Firebase env values loaded. Both known Render backend health URLs
  returned HTTP `200`, but both expose only the older four-metric payload and
  omit the RC2 `smart_health_legacy_*` metrics added in `71e2903d`; the live
  backend is therefore healthy but old, while current live-database state
  remains unverified rather than being reported as never configured.
- Android debug signing and historical emulator runtime are proven. A
  production release signing configuration/keystore was not found; the prior
  release artifact is explicitly unsigned. Real current FCM delivery, current
  emulator/device runtime and manual accessibility proof remain open.
- Firebase email-link generation has prior proof, but Brevo/SMTP inbox delivery
  and the AI provider have no current credential/live proof and remain separate
  provider gates.

## Promotion gates

| Gate | RC2 status |
| --- | --- |
| Intentional source scope, staged secret scan and diff | `PASS checkpoint`: commit `9a4855a4` contains the exact allowlisted G1–G3 integration set (`103` staged files, `93` text files scanned, zero matched secret patterns); focused production-CSS follow-up `927b1711` passes contracts, build, preview smoke and diff check |
| Local source/unit/type/lint/build | `PASS` for Backend/Web/Admin/Android/Firmware |
| Local demo launcher and authenticated Web/Admin journeys | `PASS` |
| Admin responsive/theme/permission/a11y/mutation browser matrix | `PASS` (`72` route checks plus cleanup-safe mutations) |
| Firefox/WebKit RC2 critical journeys | `PASS`: Public `16 + 16`; Portal `463 + 463` checks across 21 routes/engine |
| Local production-preview performance budgets | `PASS`: LCP 400ms, INP 56ms, CLS 0.00039, JS 200,809 bytes |
| Field Web Vitals on preview/live traffic | `OPEN`; requires deployed traffic and is not inferred from local lab proof |
| Candidate PostgreSQL migration/locking/rollback | `BLOCKED for RC2 live proof`; Supabase/PostgreSQL was configured and previously exercised, but the RC2 shell lacks `DATABASE_URL` and migrations through `054` are not live-verified |
| Firebase Admin/service account and public HTTPS backend | `PARTIAL/BLOCKED for RC2 promotion`; retained Firebase Admin credential works read-only and Web/Admin plus both Render health URLs are HTTP 200, but the RC2 shell is not bound to the secret env and Render metrics prove the backend is still the older revision |
| S3/object storage and PHI/HMAC keys | `BLOCKED for current RC2 proof`; Supabase S3-compatible Storage has prior setup evidence, but current production credentials and signed upload/download/expiry behavior were not re-verified |
| Email/push/AI providers, CORS and Redis | `MIXED/BLOCKED`; preview-origin preflight reproduces a backend CORS mismatch (both preview origins receive the Admin live origin), while current device delivery, Brevo/SMTP inbox delivery, AI credentials and remaining production inputs are unproven |
| OTA signing key/artifact URL and canary infrastructure | `BLOCKED` |
| Android Firebase/FCM, ADB/emulator/device and production signing | `MIXED/BLOCKED`; Firebase code and retained local config plus historical emulator runtime exist; RC2 lacks the ignored config, no target is online now, current FCM is unproven and production signing is genuinely absent |
| Physical ESP32-S3 flash, serial and dual-slot I2S | `PASS`; final image flashed and hash-verified, both mic slots non-zero with no degraded/reboot marker |
| Production device WSS/auth, command ACK and forced OTA rollback | `BLOCKED`; requires encrypted NVS/device credential/CA provisioning and signed canary infrastructure |
| Deep Security Scan | `PASS`; durable scan `1b48646c-c3fe-4835-9526-92177be380ae` finalized and sealed with `8` findings, and every confirmed path has remediation or explicit already-safe validation with focused regression proof |

The candidate is **local-demo ready**, not production-ready. Phase 8 and the
overall plan remain open until all required non-deferred release gates pass.
Hardware-only HIL may remain deferred under the user's locked rule, but no
software/provider/live gate is silently waived.

## 2026-08-23 release-source gate refresh

- A clean-clone regression was reproduced in `smoke:identity-migrations`: the
  smoke read ignored runtime state from `data/db.json` and failed with
  `ENOENT`. Revision `c1933d979db69ae8bc105489d1accdec9bfd0fe5`
  replaces that dependency with a committed synthetic fixture containing no
  production identity or PHI. Focused identity smoke and the aggregate backend
  check/test gates pass after the fix.
- Fresh secret-free RC2 gates pass for backend check/base, KLT, API production,
  workspace, repositories, identity migration, notification push, support,
  role-request documents, 2FA, device security, appointment, avatar and the
  non-strict production-readiness report; shared contracts pass `50/50`.
- Web direct TypeScript, lint, contracts and build pass. Platform Admin lint,
  contracts and build pass. Android unit/compile/AndroidTest compile/lint/debug
  APK exits `0`. Firmware source contract plus production and OTA builds pass.
- Git push dry-run for branch `release/shcare-v1.0.0-rc.2-local-demo` succeeds.
  This proves Git remote authorization only; it is not a deploy or PR.
- The retained Firebase configuration can build preview artifacts without
  copying secrets into the worktree. Authenticated preview smoke still requires
  the exact preview origins in backend CORS. Backend main promotion remains
  blocked until migrations `044` through `054`, Render start mode and rollback
  behavior are verified.

## Deploy and rollback order

1. Recover and inject the existing ignored/secret-managed Firebase, Render and
   Supabase configuration into the RC2 release environment without committing
   it. Provision only providers that are genuinely missing; apply and verify
   additive migrations through `054` with rollback evidence against a safe
   candidate PostgreSQL/S3 environment.
2. Deploy the backward-compatible backend first; run read-only and one
   tenant-scoped, idempotent mutation smoke with cleanup.
3. Deploy Platform Admin preview; verify direct-URL capability denial and one
   cleanup-safe mutation, then back up and promote Admin.
4. Deploy Web/Portal preview; run route/auth/mutation/offline/retry smoke, then
   back up and promote Web/Portal.
5. Produce a release-signed Android artifact, run internal emulator/device,
   FCM/deep-link/lifecycle/TalkBack proof, then distribute through the approved
   channel.
6. Keep device/protocol/OTA behind compatibility flags. Canary firmware only
   after physical target/partition, authenticated WSS, I2S/audio, command ACK
   and forced-failure A/B rollback proof.

Rollback remains independent: previous backend deploy or commit revert,
Firebase backup channel per Web/Admin site, previous Android distribution
artifact, and the previous confirmed firmware image. A UI-only rollback does
not require firmware rollback while the compatibility verdict remains green.

## 2026-08-24 G3 security candidate addendum

- Governing plan: [“Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare”](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md); G3 is still in progress and G4 has not started.
- Durable Deep Security scan `1b48646c-c3fe-4835-9526-92177be380ae` is complete and sealed with `8` findings. Confirmed paths have source remediation or were revalidated as already safe, with focused regression proof.
- Candidate working identity before final freeze: base HEAD `1c902b29405717c28d8dfa908e4eeb16137971cc`, dirty snapshot hash `dc3e7457f923ddb2483e9e12aff0a6205d58aff5`.
- Current Android debug APK SHA-256 is `9B58268A123FB66CFD4139CF3F47C8C13F491EAC0BE0CACDAEA416ED0D866C62`. Production firmware SHA-256 remains `A31F9F6B32AF05F253AEB5D00063F8BA0318D6C9965CB0F9EE01B9CB02E54004`; OTA SHA-256 remains `ECB97D1D56561D954425365CF15E7FE35F3A7C26BDC65B659196FFB028A3A9E1`.
- Do not promote from this addendum alone. Browser smoke, production/provider/migration preflight, exact candidate freeze and rollback evidence remain required before G4 deployment.

## 2026-08-24 final G3 pre-candidate evidence

- Post-security browser smoke passes: Public `17`, Auth forgot-password `17`, Portal `478`, and Admin Storage mobile/system. The older full browser matrices remain valid because no current security change modified those route presentations.
- Secret-pattern scan covered `89` intentional modified/untracked source files and found `0` private-key, AWS, Google API key, GitHub token, Slack token or JWT literal hits. `git diff --check` passes with only Git line-ending notices.
- Firebase project access is live, both Hosting sites are HTTP `200`, and both known Render services are healthy on `/api/health`. Their metrics still identify an older backend revision. Candidate PostgreSQL/S3 secrets are not bound to this shell, so migration `055`, PHI backfill and provider behavior must be proven in G4 before promotion.
- Physical `COM9` reports ESP32-S3 revision `0.2`, `16MB` flash and `8MB` PSRAM. The already-flashed firmware artifact is unchanged; the existing two-mic HIL proof remains the relevant evidence.

## 2026-08-24 Firebase backup and preview checkpoint

- The intentional integration checkpoint is commit `9a4855a4f286b77c35470dfc92e269a6504ef111`; the focused production-CSS fix is commit `927b171132d834acfe6a52bb7f3ab7e6e6d7189a`. The branch is pushed. Existing tag `shcare-v1.0.0-rc.2-g3` is immutable; the documentation checkpoint is released under a new tag rather than moving it.
- Live Hosting was backed up independently before any preview work: Web [backup-20260824-g3](https://shcare--backup-20260824-g3-qjvu7wk6.web.app) and Admin [backup-20260824-g3](https://shcare-admin--backup-20260824-g3-8xb53yl7.web.app).
- Candidate previews are Web [rc2-web-9a4855a4](https://shcare--rc2-web-9a4855a4-qxpr54og.web.app) and Admin [rc2-admin-9a4855a4](https://shcare-admin--rc2-admin-9a4855a4-8mb2r6z9.web.app). No live channel has been promoted.
- Production-minified CSS initially retained a legacy mobile Auth blur. The source rule now explicitly disables both standard and WebKit backdrop filters. The deployed Web preview passes `/quen-mat-khau` at 360 px in `light`, `dark` and `system`: no overflow or console error, `backdrop-filter: none`, and button contrast `6.16:1` light / `5.40:1` dark.
- Admin preview `/storage` resolves through the protected route to `/login` for an anonymous actor, returns HTTP `200`, uses dark/system theme without horizontal overflow and emits no console error. Source contract tests continue to prove that `platform.storage.manage` exposes the Storage menu/direct URL while unauthorized users are denied.
- Both exact preview origins currently receive `Access-Control-Allow-Origin: https://shcare-admin.web.app` from the old live backend. This is a reproduced G3 blocker for authenticated preview API smoke. Do not promote Hosting or backend until the production CORS list is updated atomically with the backend release and migrations/secret readiness is proven.

## 2026-08-24 Android/ESP Wi-Fi provisioning candidate addendum

- Source checkpoint: `bb8b5f4ea31e5ff6c798007d70cf1ef2dcc372a5`.
- Android debug APK: `26,954,873` bytes; SHA-256 `2D33500435F0B7A7A2851648D1672D6973CE3263AE2800828E4063CB61EBFFDB`; `838/838` unit tests, AndroidTest compile and zero lint issues.
- Production firmware: `1,130,768` bytes; SHA-256 `5B61DDAD78613DEB6A1EB4ECFF1C2035C791666838057D5EC71AFC01551EC828`; physical ESP unit test `54/54`.
- Compatibility verdict: additive local setup protocol v1. Existing browser `/save` remains; Android adds `/api/v1/setup/session` and `/api/v1/setup/wifi`. UI reports ESP acceptance only after HTTP `202` and reports final success only after authenticated backend presence.
- Captive Web HIL passes on the physical board. Android physical runtime remains `BLOCKED` without an ADB target; real target-network success waits for user-entered Wi-Fi material. This addendum does not close G3 or authorize live promotion.

## 2026-08-24 legacy Web and attached-device candidate addendum

- Frozen product-source commit: `f6b6e2aa4a957ccfb395ec265348950e407bbeb8`.
- Intentional Web presentation changes preserve the deployed legacy style and current Shcare logo while retaining functional RC contracts. The duplicate hero edge video was removed; fonts are self-hosted; theme, reduced-motion, responsive contrast and smoke diagnostics are hardened.
- Clean candidate proof: Auth `390/390`, Web contracts `137/137`, TypeScript, lint and Firebase production build. Public production-preview metrics: LCP `668ms`, CLS `0.05436187199931413`, INP upper bound `16ms`, transfer `398459` bytes, JavaScript `248111` bytes and CSS `64920` bytes.
- Web artifact hashes: `dist-firebase/index.html` SHA-256 `8B92AB206D2493777507FBBB84E877A9F4CA67FC86A8D32DA62CF5F970B495ED`; `assets/index-DfmaCRK3.css` SHA-256 `D88A4A108F660D64A9F01A699C11FE1B570D40DBF706CF88DB572301724D0AFA`.
- Current Android debug APK is `26,957,689` bytes, SHA-256 `8EB49417A11D33388D3C04BB339916ED8A7E978EDD193D5F432A531ABBC159D3`; it installed and launched on the attached Xiaomi target. Current runtime aggregate is `83` executions, `0` fail, `3` skipped, with two notification cases blocked by MIUI policy.
- Physical ESP captive-portal HIL passes and both mic slots are active. Authenticated WSS/ACK/audio-v2/durable scan remains open because the target Wi-Fi credential must be entered by the user through the App or captive Web; current serial state is `wss=0`.
- Compatibility verdict remains additive for UI and provisioning contracts. G3 is not yet PASS, G4 has not started, and no new production promotion is recorded.

## 2026-08-25 superseding Web preview candidate

- Product binary/source commit is `6c6d79f67c6d03e464545d37bf50bd31a57312e2`; `b09461428818da90e34ad05641e16a329df92a03` changes only a matching source-contract assertion and does not alter the deployed binary.
- Candidate preview: [rc2-web-6c6d79f6](https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app). The uploaded artifact passes `102/102` focused Chromium checks for Home and Forgot Password across `light|dark|system` at 390px. No production Hosting promotion occurred.
- Final clean gates are Auth `390/390`, Web contracts `138/138`, TypeScript, lint and Firebase build. Public performance remains inside budget: LCP `532ms`, CLS `0.05434283907750343`, INP upper bound `16ms`, transfer `398360` bytes, JavaScript `248011` bytes and CSS `64921` bytes.
- Final Web artifact hashes: `dist-firebase/index.html` SHA-256 `E40941D7EEA90A3D121161E7942860B350E82D14216761008389668A9F1AC32D`; `assets/index-DUYZleE1.css` SHA-256 `A5AF7BAE74AC2AD8BD92E9BC3D1FD62832DB40B23C49D89CA670D2C3C713986F`.
- Preview QA reproduced and fixed a production-minifier CSS ordering issue that left the Forgot Password card blurred. The final rule keeps both WebKit and standard `backdrop-filter` disabled. The public smoke now waits for the rendered shell rather than impossible `networkidle` while Firebase streams the hero MP4.

## 2026-08-25 backend CORS candidate addendum

- Backend source candidate `4727e183d85e8368203d2f0bcd1ba9f6154105ca` authorizes only the exact Shcare Web/Admin live origins and the two current RC preview origins. A configured production origin is unioned with these first-party origins; an unrecognized origin receives no ACAO header.
- Source proof: CORS unit/integration `4/4`, backend check/base test, KLT, workspace access, repositories, release-security `4/4` and device-security `82/82` PASS. The branch is pushed; Render/live has not been promoted, so the previously observed live CORS response remains the rollback baseline rather than release proof.
- `scripts/start.js` applies unapplied SQL migrations transactionally whenever `DATABASE_URL` is present. Migration `055_phi_encrypted_payloads.sql` is additive, but provider credentials and production database execution are not bound to this shell and must be verified in the G4 backend lane before promotion.

## 2026-08-25 release identity and signed-OTA addendum

- Backend `6aa43f8f` exposes bounded `release.id` and the actual 12-character Render/source commit on both health aliases. `SMOKE_EXPECTED_RELEASE_ID` and `SMOKE_EXPECTED_COMMIT` make a stale or wrong backend deployment fail closed.
- Firmware `f13cc781` pins the public Shcare RSA-3072 OTA trust anchor. The private key is not in Git and the backend signing implementation produced a signature verified by the matching public key. Public-key fingerprint SHA-256: `0B1A7DA75C0F87710CDBD578D3E164E2A12670BF436ACC70C5B640726690E32B`.
- Wired/production artifact: `1,131,392` bytes, SHA-256 `06167CEFBC405C102B741363BEC6FF21BF1CB91B0A9E08B85B1EAD61203495DD`. OTA-environment artifact: `1,131,392` bytes, SHA-256 `F6F1D0A3AD38982C96897A3759A396DBA3C7EDED17A0797EA73F68431F536381`. The wired image was flashed and verified on COM9.
- This closes key generation/pinning and build/flash only. It does not claim signed OTA canary, boot-health confirmation or forced rollback until the ESP completes target-Wi-Fi/WSS HIL and the backend secret is bound in the release environment.
