# Shcare release candidate manifest (pre-tag)

Release label: `Shcare 1.0.0-rc.1`
Candidate Git ref: `shcare-v1.0.0-rc.1`
Baseline revision: `bf0d08cdd70d9c89ea4dd1b53fcf3e95578d026a`
External baseline manifest SHA-256:
`487CCBD8C00B7164F10E4D4F9E71F08208FFC745E4C6A4C43F7C6942BEF93C8A`
Prepared: `2026-07-23` (`Asia/Saigon`)

The final candidate SHA will be the commit resolved by
`git rev-parse shcare-v1.0.0-rc.1`. The tag does not exist while this
pre-candidate manifest is being prepared. It is created only after the
intentional index passes scope, secret and diff checks, then the exact source
commit passes clean-worktree verification. This document does not claim a
preview or production deployment.

## Candidate scope

Included:

- `PRODUCT.md`, `DESIGN.md`.
- `docs/SMART_HEALTH_*.md` and `docs/khoaluan/**`.
- `packages/shcare-brand/**` and `packages/shcare-contracts/**`.
- `smart-health-web/**`, except local debug captures.
- `smart-health-admin/thiết kế giao diện/**`, except ignored environment,
  dependency, build and CodeGraph state.
- `smart-health-android/**`, except ignored SDK, credential and build state.
- `smart-health-embedded/web-monitor/**` and
  `smart-health-embedded/MSM261S4030H0/**`.
- Embedded CI and versioned source/contract fixtures used by those canonical
  modules.

The pre-tag path audit expects `510` candidate files. A different staged count
requires a new scope audit before commit.

Explicitly excluded:

- CV, portfolio, Word/PDF submission files and `FILE BÁO CÁO...`.
- `.codex`, `.codegraph`, `.codebase-memory`, `node_modules`, Gradle,
  PlatformIO, build, distribution and local runtime data.
- Ignored `.env*`, `local.properties`, `google-services.json`, service-account,
  signing-key and device-secret material.
- `Smart-Digital-Stethoscope`, `connect-hub`, old `docs/report-evidence`,
  generated architecture/report assets and Web debug screenshots.
- `main_backup.cpp` remains only as a marked legacy source file; it is not a
  production firmware entry point.

## Version and compatibility matrix

| Surface | Candidate version | Canonical contract | Compatibility verdict |
| --- | --- | --- | --- |
| Backend | package `0.2.0`, release label `1.0.0-rc.1` | HTTP `/api/v1`, authenticated WSS, migrations through `043` | Additive source compatibility retained; old aliases stay within the compatibility window |
| Public/Auth/Portal | release label `1.0.0-rc.1` | `RouteContract`, backend capability and error contracts | Compatible with the additive backend; never confirms a mutation before the backend outcome |
| Platform Admin | release label `1.0.0-rc.1` | Admin route/capability contract and `/api/v1` | Compatible with the additive backend; independent UI and rollback from Portal |
| Android | `versionCode=2`, `versionName=1.0.0-rc.1` | Typed mobile routes, HTTP/WSS contracts and native Compose state | Backend-first compatible; production distribution remains blocked until release signing and device/emulator proof |
| Firmware | `1.0.0` | device auth/command v1 and bound audio v2 | Canonical WSS product path; raw PCM v1 remains migration-only and UDP/LAN OTA remain development-only |
| Brand package | `@shcare/brand@0.1.0` | React-free token/font/SVG contract | Web/Admin only; Android keeps `ShcareMobileTheme` and native components |
| Shared schemas | `@shcare/contracts@0.1.0` | HTTP v1, device v1 and audio v2 fixtures | Backend, Android and firmware fixtures agree at source/build level |

Database migrations `011` through `043` are additive source artifacts. Their
presence and local repository tests are not evidence that migration `042` or
`043` has run on candidate/live PostgreSQL.

## Fresh pre-candidate build evidence

The evidence below was collected from the intended working-tree source before
the release tag existed. It is a staging gate, not yet clean-tag proof. Final
candidate verification must rerun the required gates from a detached clean
worktree at the candidate source revision.

### Web/Portal

- `npm.cmd run test:auth`: `29/29` files and `105/105` tests passed.
- `npm.cmd run test:contracts`: `63/63` passed.
- TypeScript, ESLint and Firebase production build passed.
- `bun audit` reports `No vulnerabilities found` after pinning compatible
  patched transitive versions and moving Vite to `7.3.6`; all Web tests,
  TypeScript, lint and build gates passed again after the lockfile change.
- Firebase build: `2392` modules; CSS `403.51 KB`, `62.60 KB` gzip; Shcare
  Vietnamese fonts total `82.57 KB`.
- Isolated full Portal browser smoke returned `ok: true`. It exercised
  capability-derived navigation, direct-URL denial, Patients, Appointments,
  Live, Records, Devices, Consent, Reports, Settings, Alerts, Notifications,
  Help, Onboarding, Workspace and nested routes with no accumulated HTTP
  failure, request failure or severe console error.
- The post-dependency-update browser regression also returned `ok: true`.
  Because that rerun used a non-allowlisted local origin on port `8083`, its
  Chromium web-security bypass is harness-only and is not CORS proof; the
  earlier canonical local run remains the CORS-enabled route proof.

### Backend

- `npm.cmd run check` passed.
- `npm.cmd test` passed, including the fresh-demo-doctor operational Portal
  membership regression.
- The browser proof used isolated JSON data and demo auth on local ports only;
  it did not modify live data.

### Platform Admin

- Contract suite passed `151/151`; the client/SSR Firebase Admin production
  build passed from current source.
- The previously verified authenticated matrix remains `72/72`.
- `@cloudflare/vite-plugin` was moved from runtime dependencies to
  `devDependencies`; contract tests and the Firebase Admin build passed after
  the lockfile update.
- `npm audit --omit=dev` now reports `1 low`, `0 high`, `0 critical`. The
  remaining low advisory is `esbuild` through `tsx` and applies to exposing a
  development server on Windows; it is not closed by the static production
  build and remains tracked until the dependency chain publishes a safe update.
- The full build-tool graph still reports `5 high` advisories through
  `@cloudflare/vite-plugin → wrangler/miniflare → sharp`. That chain is
  development-only and is absent from the production-only audit.

Dependency risk record:

| Chain | Severity/reachability | Mitigation | Owner/expiry |
| --- | --- | --- | --- |
| `tsx → esbuild` | Low; Windows development-server file-read advisory | Never expose the Vite development server; use the built Firebase artifact; update when a compatible release lands | Release/security owner; review before GA |
| `@cloudflare/vite-plugin → wrangler/miniflare → sharp` | Five high findings in the development-only graph; absent from `--omit=dev` | Keep the plugin dev-only, do not ship its dependency tree, and avoid an unsafe forced downgrade | Release/security owner; review at `rc.2` or before GA |

### Android

- `testDebugUnitTest`: `176/176` passed across `30` result files.
- `assembleDebug` and `lintDebug` passed; lint has `0 Fatal`, `0 Error` and
  `43 Warning`.
- Debug APK: `23,288,261` bytes.
- Debug APK SHA-256:
  `59351C0EB663D7800121EAD718C27BC876C00B40C396ABEDC8315AC9A33C8F9A`.
- APK manifest confirms `versionCode=2` and `versionName=1.0.0-rc.1`.
- APK is signed only with the Android Debug certificate
  (`SHA-256 eb16eacc45036db97525834850cb17764c50eb4a379c48f47edd84e988884db8`).
  This is internal build proof, not production signing proof.

### Firmware

| Profile | Bytes | SHA-256 |
| --- | ---: | --- |
| `esp32-s3-devkitm-1` production | 1,084,304 | `C184256358BB27AA1FEE392B2D9E04033BD56AB0B0F4B521193BC5BBEA5503D6` |
| `esp32-s3-development` | 1,084,272 | `75F8460FF79014456EFFA11584DB059560CAD46255BA98C42CEB51FCE7C92A35` |
| `esp32-s3-ota` build | 1,084,304 | `4BF11B1AFABF6AD52175C9B76407A04F416943A7FF01E9C57278AD4E6C0D06A7` |

All three PlatformIO builds passed. The OTA profile was built but not uploaded.
PlatformIO still reports the board definition as `8MB Flash` while the checked
configuration uses a 16 MiB partition layout. Only a physical-board flash-size
and partition check can close that discrepancy.

## Promotion gates

| Proof class | Status |
| --- | --- |
| Intentional index scope/secret/diff | `PENDING` until the release index is audited |
| Clean candidate worktree | `PENDING` until the candidate source commit exists |
| Source/contract | Pre-candidate working-tree evidence recorded; clean-candidate rerun pending |
| Local unit/lint/type/build | Pre-candidate working-tree evidence recorded; clean-candidate rerun pending |
| Local browser | `PARTIAL`: Portal and prior Admin matrices verified locally; clean candidate and preview proof pending |
| Full responsive/theme/role route sweep | `PENDING`: 360/390/768/1024/1440, light/dark/system and every role are not yet proven as one candidate run |
| Firefox/WebKit critical journeys | `PENDING` |
| Axe and fixed visual snapshots | `PENDING`; no candidate-wide zero-serious/critical or deterministic snapshot proof yet |
| Public performance budgets | `PENDING`; build sizes are recorded, but LCP/INP/CLS and public initial-JS acceptance are not yet proven |
| Candidate PostgreSQL migrations/locking/rollback | `BLOCKED` until a safe candidate database is available |
| Firebase/Render/storage/email/FCM preview/provider | `BLOCKED` until credentials/services are available and cleanup is proven |
| Android emulator/device, TalkBack, permission, FCM and lifecycle | `BLOCKED`; no safe runtime target is attached |
| Android production signing/distribution | `BLOCKED`; only the debug-signed APK exists |
| ESP32-S3 flash, serial, I2S, authenticated WSS and OTA rollback | `BLOCKED`; no physical board is attached |

No production promotion is allowed while a required P0/P1 live/runtime gate is
unresolved. A provider or hardware blocker must remain `BLOCKED`; it must not
be converted into a source/build completion claim.

## Deploy and rollback order

1. Apply and verify additive backend migrations on a candidate database.
2. Deploy the backward-compatible backend and run read-only plus cleanup-safe
   mutation smoke.
3. Deploy Platform Admin preview, verify direct-URL permissions and one
   cleanup-safe mutation, then promote Admin if green.
4. Deploy Web/Portal preview, run the route and mutation smoke with cleanup,
   then promote Web/Portal if green.
5. Build and sign Android with the production keystore, run internal
   emulator/device smoke, then distribute through the approved channel.
6. Keep device/protocol features behind compatibility flags. Canary firmware
   only after physical WSS/I2S/command/OTA rollback proof.

Rollback is independent by surface: previous backend deploy or commit revert,
Firebase backup channel per site, previous Android track artifact, and the
previous confirmed A/B firmware image. A UI-only rollback must not require a
firmware rollback when the compatibility verdict remains green.
