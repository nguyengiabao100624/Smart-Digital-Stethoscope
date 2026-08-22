# Shcare 1.0.0-rc.2 release candidate manifest

Release label: `Shcare 1.0.0-rc.2`

Baseline revision: `fdeb1f8783827c6493534b9083858ccc113ee8da`

Verified product-source revision: `71e2903d2e34474183a569e304fd32ceabc81f3f`

Prepared: `2026-08-22` (`Asia/Saigon`)

Governing plan: **[Kế hoạch tái thiết toàn diện Shcare Web, Portal,
Platform Admin, Android và firmware](SHCARE_REBUILD_MASTER_PLAN.md)**.

This manifest binds the Phase 8 local demo/release-candidate evidence to one
intentional product-source commit. It does not claim Firebase preview,
production deployment, provider delivery, Android production signing/runtime,
or physical firmware proof.

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
| Backend | package `0.2.0`, release label `1.0.0-rc.2` | HTTP `/api/v1`, authenticated WSS, migrations through `054` | Additive migration and compatibility-window aliases retained |
| Public/Auth/Portal | `1.0.0-rc.2` | Route/capability/state contracts and strict backend receipts | Compatible; no mutation success before a validated backend outcome |
| Platform Admin | `1.0.0-rc.2` | Independent Admin route/capability and real list/mutation APIs | Compatible and independently deployable/rollbackable from Portal |
| Android | `versionCode=3`, `versionName=1.0.0-rc.2` | Native typed routes, repositories/ViewModels and shared HTTP/WSS schema | Backend-compatible; UI/UX remains native and separate from Web |
| Firmware | `1.0.1` | authenticated device command v1, audio v2 and OTA lifecycle | New release version is monotonic; physical compatibility proof remains deferred |
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
- Generated `dist` tree: `246` files, `5,660,568` bytes, tree SHA-256
  `B3C5B13F323BD63EB1BC84E07A4440B34F337DBAE1A9CFEA76BA4B5CC3379E89`.

### Backend

- `npm.cmd run check`, base smoke and KLT contract smoke: PASS.
- Shared contracts: `50/50`.
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
- Generated `dist` tree: `239` files, `8,510,428` bytes, tree SHA-256
  `9C1B6A17E912B7E2C0E7B3EF20C02D44B5300EC27A6BB4A89ED6011DC8B3645E`.

### Android

- Retained exact-current aggregate proof: `116` suites / `830` JVM tests;
  AndroidTest Kotlin compile, debug assemble and lint: PASS.
- Debug APK: `26,948,657` bytes; SHA-256
  `BABAAA7BFB7289E33A7BF84A4289282A450C9908A3834E762A11938F0D18F7C7`.
- This is debug/source-build proof. `google-services.json`, an ADB target,
  production signing and manual TalkBack/device proof are absent.

### Firmware

| Profile | Version | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `esp32-s3-devkitm-1` production | `1.0.1` | 1,121,328 | `8C69BC84BFEA58594606B3778817855758E1599C7916936570621466058B626A` |
| `esp32-s3-ota` build | `1.0.1` | 1,121,328 | `FE01440C043110EC90A01E0F0F3FAADB288991F1A8985C796F0B5037A6167968` |

Both PlatformIO builds pass. Production reports RAM `52,864 / 327,680` and
flash use `1,120,965 / 6,291,456`; both binaries contain the `1.0.1` literal.
OTA upload was not attempted because no target/IP exists. PlatformIO reports an
8 MB board definition while the intended partition design is 16 MB; only
physical flash/partition inspection can close that discrepancy.

## Promotion gates

| Gate | RC2 status |
| --- | --- |
| Intentional source scope, staged secret scan and diff | `PASS`: 787 paths, 0 outside allowlist, 0 secret-signature matches, clean staged diff |
| Local source/unit/type/lint/build | `PASS` for Backend/Web/Admin/Android/Firmware |
| Local demo launcher and authenticated Web/Admin journeys | `PASS` |
| Admin responsive/theme/permission/a11y/mutation browser matrix | `PASS` (`72` route checks plus cleanup-safe mutations) |
| Firefox/WebKit RC2 critical journeys and field Web Vitals | `OPEN`; not required to run the isolated local demo, required before live promotion |
| Candidate PostgreSQL migration/locking/rollback | `BLOCKED`; PostgreSQL is not configured |
| Firebase Admin/service account and public HTTPS backend | `BLOCKED`; credentials/URL are absent |
| S3/object storage, PHI/HMAC keys, provider credentials, CORS and Redis | `BLOCKED`; production-readiness inputs are absent |
| OTA signing key/artifact URL and canary infrastructure | `BLOCKED` |
| Android Firebase/FCM, ADB/emulator/device and production signing | `BLOCKED` |
| Physical ESP32-S3 flash, serial, I2S, WSS, command ACK and OTA rollback | `DEFERRED — chờ phần cứng` |
| Deep Security Scan | Separate durable scan remains `running/preflight`; not represented as complete here |

The candidate is **local-demo ready**, not production-ready. Phase 8 and the
overall plan remain open until all required non-deferred release gates pass.
Hardware-only HIL may remain deferred under the user's locked rule, but no
software/provider/live gate is silently waived.

## Deploy and rollback order

1. Provision production secrets/providers and a disposable candidate
   PostgreSQL/S3 environment; apply and verify additive migrations through
   `054` with rollback evidence.
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
