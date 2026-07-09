# Smart Health - Commands Guide

Last updated: 2026-07-09

This file contains the commands future new chats should use instead of rediscovering how to run the project. Update it whenever commands, ports, env vars, scripts, or verification steps change. Keeping this file current reduces quota/token usage in new chats because the assistant can read this guide instead of scanning package files and scripts first.

All commands are for Windows PowerShell unless noted.

Project navigation entrypoint:

```text
D:\Study\KLTN\docs\SMART_HEALTH_PROJECT_INDEX.md
```

Use that file first for active source folders, handoff order, live URLs, cleanup rules, and focused smoke commands.

## Shcare Workspace Portal — current build, deploy, and smoke

`shcare.web.app` is built from `D:\Study\KLTN\smart-health-web` and Firebase Hosting target `webapp`. Older commands aimed at the Web Admin repository or target `admin` are for `shcare-admin.web.app`, not this portal.

Current active backend after the 2026-07-09 Render account migration is `https://smart-health-api-r5is.onrender.com` with API base `https://smart-health-api-r5is.onrender.com/api`. The previous `smart-health-api-xj0a` URL belongs to the old Render workspace that exhausted the free outbound bandwidth allocation.

Latest confirmed live deploy after the 2026-07-09 Render migration, portal settings/consent/workspace-summary follow-ups, and portal UI density/search-field polish: Firebase Hosting site `shcare`, version `projects/162993928259/sites/shcare/versions/a1b568cf873aac0d`, release `projects/162993928259/sites/shcare/channels/live/releases/1783594254847000`. The deployed login flow keeps distinct Android-only/patient, pending, needs-info, rejected, portal-denied, platform-admin, and invalid-credential messages without exposing raw Firebase `auth/*` text. `bun run smoke:portal-browser` confirms live Firebase login, portal API reads, records filters, sidebar route buttons, avatar menu, notification menu, device claim route, consent/share controls, audit navigation, portal settings profile/security/notification/workspace controls, and `/portal/workspace` numeric summaries from backend `/me`. The latest UI visual QA also confirms portal search icons no longer overlap placeholder text on Patients/Records/Audit/Help, portal titles are normalized to `21.44px`, search inputs to `44px` height with `14px` text and about `12.809px` icon-to-text gap, and checked desktop/mobile routes have zero horizontal overflow. `bun run smoke:portal-mutation` last passed against the new backend with run id `portal-mutation-mrdczthd`, including patient share create/revoke, account profile, workspace settings, notification-preference restore cleanup, device cleanup, support cleanup, logout, and session recovery.

Web Admin current live deploy after the same migration: Firebase Hosting site `shcare-admin`, version `projects/162993928259/sites/shcare-admin/versions/35d5d0458143d1b4`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783534018473000`. Platform Admin navigation exposes `/devices` for full-right accounts. Shcare Web and Web Admin forms now use `method="post"` so native/pre-hydration submit does not leak credentials through URL query strings; a custom Playwright smoke verified no-query-leak behavior plus hydrated admin/portal logins.

Web Admin now has controlled live destructive mutation coverage through `npm.cmd run smoke:admin-mutation` in `smart-health-admin\thiết kế giao diện`. It signs into `https://shcare-admin.web.app`, mutates live Render data with unique test IDs, and cleans up settings, notification, storage bucket, device, patient, package, and workspace records.

2026-07-09 migration/workspace/UI QA: Render backend `smart-health-api-r5is` returned HTTP 200 for `/api/health` and `/api/v1/health`, and expected HTTP 401 for unauthenticated `/api/me`. After Firebase deploys, live verification passed with `npm.cmd run smoke:public-deployment`, `npm.cmd run smoke:production-roles`, `npm.cmd run smoke:portal-production`, `bun run smoke:portal-browser`, `bun run smoke:portal-mutation` run `portal-mutation-mrdczthd` after the workspace-summary follow-up, `npm.cmd run smoke:admin-mutation` run `admin-mutation-mrcebq30`, and targeted Playwright visual QA after the portal density/search-field deploy. A follow-up density sweep checked 19 portal routes for overflow, H1/input/button/search sizing, search icon gap, logo image loading, and severe console/page errors; it passed with no failing routes.

2026-07-09 Android account/family/workspace backend contract coverage: `smoke:workspace-access` now also covers the patient Android path for family profile create/update/delete, consent history, password change, 2FA setup, auth session list/revoke, revoked-token denial, and a joined doctor workspace switch through `/api/v1/me`. For this slice, use:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
node --check .\server.js
node --check .\scripts\workspaceAccessSmokeTest.js
npm.cmd run smoke:workspace-access
npm.cmd run check

cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

2026-07-09 patient-share repository persistence: Supabase project `smart-health-production` (`mahvymyncxszvuhlycwp`) has app migration `009_doctor_patient_access_runtime_parity` applied. The verified production schema now supports `doctor_id`, `scope`, JSONB `scan_ids`, `revoked_by_user_id`, `updated_at`, nullable `doctor_user_id`, and patient/doctor/workspace share indexes. Backend source verification for this slice:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
node --check .\src\repositories.js
node --check .\server.js
node --check .\scripts\migrateJsonToPostgres.js
node --check .\scripts\repositoriesSmokeTest.js
npm.cmd run smoke:repositories
npm.cmd run check
npm.cmd test
npm.cmd run smoke:workspace-access
```

Render `npm start` runs `scripts\migrate.js` when `DATABASE_URL` exists. Because migration 009 was applied directly through Supabase and inserted into the app `schema_migrations` table, Render startup should skip replaying duplicate share constraints after the source deploy.

Source tracking note: `smart-health-web` is a tracked source project. Keep `dist/`, `dist-firebase/`, `.firebase/`, `.vite/`, `.tanstack/`, `.lovable/`, and `firebase-debug.log` untracked; `docs/Logo.png` and `smart-health-web\MẪU UI UX\bacsi.mp4` are required runtime assets for the portal build.

GitHub Actions workflow for Shcare Web: `.github/workflows/deploy-shcare-web.yml`. Pushes touching `smart-health-web/**` run a build-only CI job with `bun install --frozen-lockfile`, `bun run lint`, and `bun run build:firebase`. Firebase Hosting deploy target `webapp` runs only from manual `workflow_dispatch` and requires `FIREBASE_SERVICE_ACCOUNT_JSON`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID` repository secrets.

```powershell
cd D:\Study\KLTN\smart-health-web
bun run build:firebase
```

As of 2026-07-05, `bun run build:firebase` loads production web env through `scripts/production-env.js` before validation and Vite config execution. Override with explicit process envs or `SHCARE_WEB_ENV_FILE` only when you intentionally need a different backend/site. The default fallback uses the existing Web Admin `.env.production` and safe public defaults for Render API and `https://shcare.web.app`; it must not print secret values.

Deploy the generated `dist-firebase` directory:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json'
$env:npm_config_cache = 'D:\Study\KLTN\.npm-cache'
npx.cmd firebase-tools@latest deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

On this Windows setup use `npx.cmd`, not `npx.ps1`, because the PowerShell execution policy can block the `.ps1` shim. Then smoke both the site and backend:

2026-06-25 sandbox note: Codex can build `dist-firebase`, but Firebase deploy may fail inside a restricted sandbox because `npx firebase-tools` needs registry/network access and the cached CLI needs Google OAuth/configstore access. If that happens, run the same deploy command from a normal local terminal with Firebase login/service-account network access, or from CI with the Firebase service account secret. Do not report the domain as updated unless the Firebase CLI prints a successful Hosting release/version.

```powershell
Invoke-WebRequest -UseBasicParsing https://shcare.web.app/login
Invoke-WebRequest -UseBasicParsing https://smart-health-api-r5is.onrender.com/api/health
```

Authenticated browser smoke for the live portal:

```powershell
cd D:\Study\KLTN\smart-health-web
bun run smoke:portal-browser
```

Prerequisite: refresh temporary smoke credentials first when needed:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
$env:PUBLIC_BACKEND_URL="https://smart-health-api-r5is.onrender.com"
npm.cmd run smoke:production-roles
```

Set `PUBLIC_BACKEND_URL` explicitly in this workspace. If omitted, `smoke:production-roles` can read a web/admin env URL and receive Firebase Hosting HTML instead of backend JSON.

`smoke:portal-browser` reads `smart-health-embedded\web-monitor\.test-data\production-role-smoke-credentials.json`, signs into `https://shcare.web.app` with the workspace smoke account, and checks Firebase `/api/auth/firebase`, key portal API responses, records search/status filters, avatar dropdown, notification dropdown, sidebar route navigation, direct read-only routes, and the audit link from the avatar menu. Current source route coverage includes dashboard, patients, live monitoring, devices, device claim, consent, records, staff, reports, alerts, settings, notifications, onboarding, help, workspace switcher, billing, review queue, device assignment, and audit. The workspace switcher route smoke asserts workspace cards, numeric patient/device/alert summaries, and an active workspace card. The consent route smoke asserts patient/target/scope/expiry/share-submit controls plus selected-scan scope UI. The settings route smoke asserts profile, security/password/session/2FA, notification, and workspace controls. It redacts auth headers and does not print passwords or ID tokens. Current source also fails the smoke if a visible portal popover lacks `backdrop-filter: blur(...)`.

Controlled live portal mutation smoke:

```powershell
cd D:\Study\KLTN\smart-health-web
bun run smoke:portal-mutation
```

`smoke:portal-mutation` uses the same credential file and workspace smoke account. It creates a unique test patient through the UI, saves patient notes, assigns a device if one exists and restores the previous assignment, provisions and claims a device through `/portal/devices/claim` with cleanup, creates/reads/deletes a notification, creates and revokes a patient consent/share grant through `/portal/consent`, saves/restores account profile title, workspace settings, and notification preferences, checks password/2FA/session controls without changing the smoke account password, exports reports CSV, submits a support ticket and deletes the resulting notification, verifies a missing-patient 404, deletes the test patient through the UI, logs out, and logs back in. The script records cleanup state immediately after each mutation so failure paths still attempt restore/delete, and it redacts auth headers without printing passwords or ID tokens.

Run this command only from a terminal or CI runner with browser network access to `https://shcare.web.app` and Render. As of 2026-07-09 it passes from this workspace on live release `projects/162993928259/sites/shcare/channels/live/releases/1783592537850000` with run id `portal-mutation-mrdczthd`; if it fails later, treat the reported live data, permission, CORS, or UI failure as actionable until rerun proves cleanup and recovery.

Local dev smoke against the production-like Render backend can hit CORS because Render is configured for Firebase Hosting origins, not `http://127.0.0.1:8080`. Use the local-only Playwright bypass flag only for source verification before deploy:

```powershell
cd D:\Study\KLTN\smart-health-web
$env:VITE_SMART_HEALTH_API_BASE_URL='https://smart-health-api-r5is.onrender.com/api'
node -e "import('./scripts/production-env.js').then(({loadProductionEnv})=>{loadProductionEnv({cwd:process.cwd(),applyToProcess:true}); process.env.VITE_SMART_HEALTH_API_BASE_URL='https://smart-health-api-r5is.onrender.com/api'; const {spawn}=require('child_process'); const child=spawn('bun',['run','dev'],{stdio:'inherit',env:process.env,shell:true}); child.on('exit',(code)=>process.exit(code ?? 0));})"

$env:SMART_HEALTH_WEB_URL='http://127.0.0.1:8080'
$env:SMART_HEALTH_API_BASE_URL='https://smart-health-api-r5is.onrender.com/api'
$env:SMOKE_DISABLE_WEB_SECURITY='1'
bun run smoke:portal-browser
bun run smoke:portal-mutation
```

Do not set `SMOKE_DISABLE_WEB_SECURITY=1` for live `https://shcare.web.app` verification. Live smoke should exercise real browser CORS.

Live portal performance regression smoke:

```powershell
cd D:\Study\KLTN\smart-health-web
bun run smoke:performance
```

`smoke:performance` uses Playwright against `https://shcare.web.app`, signs in with the workspace smoke account from `smart-health-embedded\web-monitor\.test-data\production-role-smoke-credentials.json`, measures public home/login plus portal dashboard, patients, records, devices, and settings, and fails on browser errors, blank renders, load-budget regressions, or transfer/script budget regressions. On 2026-07-07 it passed: public home transferred about 4.45 MB and loaded in about 0.8-5.1s across reruns, while authenticated portal routes loaded in about 0.4-1.3s after login.

If portal/admin login screenshots disagree about the same account, do not redo Firebase/Render/Supabase setup from scratch. First inspect the Firebase custom claims and live backend `/api/auth/firebase` result for that email. A doctor account should return `role=doctor`, `roleRequestStatus=approved`, `allowedSurfaces` containing `portal`, `defaultSurface=portal`, and a workspace name. A platform admin should return `role=admin`, `allowedSurfaces=["admin"]`, and `platform.*` capabilities. The 2026-07-01 fix verified `baobee100624@gmail.com` as `doctor` in workspace `Bệnh viện Quân y 175`.

2026-07-06 login audit note: `nguyengiabao100624@gmail.com` was verified through Firebase Admin as an enabled, email-verified password account with platform-admin claims for `org_default_clinic`. That account belongs on `shcare-admin.web.app`; an `auth/invalid-credential` result on `shcare.web.app` means Firebase rejected the credential before portal role checks.

Focused invalid-credential UI smoke:

```powershell
cd D:\Study\KLTN\smart-health-web
node -e "const { chromium } = require('playwright'); (async()=>{ const b=await chromium.launch({channel:'chrome',headless:true}); const p=await b.newPage({viewport:{width:390,height:844}}); await p.goto('https://shcare.web.app/login?smoke=invalid-credential-ui',{waitUntil:'domcontentloaded'}); await p.locator('#login-email').fill('invalid-login-smoke@smarthealth.test'); await p.locator('#login-password').fill('definitely-not-a-valid-password'); await p.locator('form button[type=\"submit\"]').click({force:true}); const a=p.locator('#login-error[role=\"alert\"]').first(); await a.waitFor({timeout:20000}); const t=(await a.innerText()).trim(); if(/Firebase:|auth\\//.test(t)||!t.includes('shcare-admin.web.app')) throw new Error(t); console.log(t); await b.close(); })().catch(e=>{ console.error(e.message||e); process.exit(1); })"
```

Local UI QA commands used for the 2026-06-24 Signal Horizon pass:

```powershell
cd D:\Study\KLTN\smart-health-web
bunx prettier --write src/app/layouts/AuthLayout.tsx src/app/layouts/PortalLayout.tsx src/app/pages/public/HomePage.tsx src/app/pages/auth/RegisterDoctorPage.tsx src/app/pages/auth/RegisterClinicPage.tsx src/styles.css src/web-styles/clinical-system.css src/web-styles/signal-horizon.css
bunx eslint src/app/layouts/PortalLayout.tsx src/app/layouts/AuthLayout.tsx src/app/pages/public/HomePage.tsx src/app/pages/auth/RegisterDoctorPage.tsx src/app/pages/auth/RegisterClinicPage.tsx
bun run build
```

Browser QA expectation for `smart-health-web` UI work: use Chrome DevTools against `http://127.0.0.1:8080/`, check public/auth routes in light and dark mode, and include desktop (~1440px), tablet (~768-1024px), and mobile (~500px in this environment) viewports. `eslint .` can be slow after a production build because it may scan `dist`; prefer targeted ESLint for changed source files or clean generated output before a whole-repo lint.

For the current contrast/register/hero class of bugs, include this focused smoke before and after deploy:

```text
- Home `/`: in light mode at scrollY=0, `.shc-public-layout[data-shc-home-hero="active"]` and hero text/video render as dark; after scrolling below the hero, data state becomes `rest` and the light page surface returns.
- Desktop-low hero fit: at 1920x768 and 1536x768, the home H1 and `.shc-preview` should stay inside the visible viewport without the headline feeling cropped by the header/background.
- Home CTA and handoff/workflow panel: text remains readable in both light and dark modes.
- Login `/login`: email/password icons and password-eye button are visible over the input surface in both light and dark modes.
- Register `/register`: fill step 1, click through to step 2, then select both `Bác sĩ Tư nhân` and `Cơ sở Y Tế / BV`; the corresponding `input[name="doctor-registration-type"]` must become `checked=true`.
- Mobile 390-393px: `document.documentElement.scrollWidth === document.documentElement.clientWidth` on home/login/register, and registration choice cards are full-width instead of squeezed.
- Public route links: from a scrolled page, clicking a React Router link should land on the next route at `scrollY=0`.
- Console should have no warnings/errors on local preview and live smoke.
```

## 0. Tooling / Skills

Canonical registry and mandatory use order:

```text
C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md
```

Canonical third-party skill directory shared by every repo:

```text
C:\Users\baobe\.agents\skills
```

Do not recreate `D:\Study\KLTN\<repo>\.agents\skills` or repo-local `skills-lock.json` files. Matt Pocock, Impeccable, Academic Research, Taste, Agent Reach, and context/token skills are installed user-wide.

Workspace local-copy audit:

```powershell
rg --files --hidden D:\Study\KLTN -g 'SKILL.md' -g 'skills-lock.json' -g '!**/node_modules/**' -g '!**/.git/**'
```

Expected result: no repo-local `SKILL.md` or `skills-lock.json`. Plugin/marketplace payloads under `C:\Users\baobe\.codex` are managed global state and must not be moved.

Local Codex Telegram bridge checks:

```powershell
cd D:\Study\KLTN\codex-telegram-bridge
npm.cmd run windows:check
npm.cmd run typecheck
npx.cmd vitest run tests/app.test.ts
npx.cmd vitest run tests/workerRuntime.test.ts tests/codexRunner.test.ts
npm.cmd test
npm.cmd run build
```

`tests/app.test.ts` covers the rich terminal notification contract: concurrent Telegram jobs, concurrent standalone sessions, duplicate replay suppression, done-without-final reported as `Failed`, and repeated failed/cancelled status dedupe. Completion notifications must include task name, request summary, Session ID, Task ID when available, start/end/duration, final status, result summary, output/file references when detected, and account/profile details.

If Codex account notifications stop after changing accounts, check recent bridge events for `telegram_account_current` and restart only after the current Telegram-launched Codex job has finished:

```powershell
cd D:\Study\KLTN\codex-telegram-bridge
npm.cmd run windows:stop
npm.cmd run windows:start-all
```

The 2026-07-04 bridge fix sends a Telegram account notification on first detected account heartbeat and on later account-hash changes. `windows:start-all` can still fail to open the mini-app tunnel if Cloudflare Quick Tunnel is blocked locally with `connectex: An attempt was made to access a socket in a way forbidden by its access permissions`; that tunnel failure does not mean the local worker/transcript watcher is stopped.

Codex Telegram bridge full-access is opt-in and applies only to new bridge-launched Codex tasks:

```text
CODEX_BRIDGE_ALLOW_FULL_ACCESS=true
```

After changing it, restart bridge server/worker:

```powershell
cd D:\Study\KLTN\codex-telegram-bridge
npm.cmd run windows:stop
npm.cmd run windows:start-all
```

With the env opt-in enabled, Telegram/dashboard `Chạy toàn quyền` runs `codex exec -s danger-full-access --ask-for-approval never`. The bridge still does not use `--dangerously-bypass-approvals-and-sandbox`; `full` resume jobs are refused because `codex exec resume` does not expose the same sandbox flag.

Skill selection guide:

```text
D:\Study\KLTN\docs\SMART_HEALTH_AGENT_SKILLS_GUIDE.md
```

Use `C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md` for Smart Health rules first. Select only required user-wide skills from `C:\Users\baobe\.agents\skills`; do not load the whole set. Every task starts with a lightweight routing/token gate: infer the smallest relevant installed skill/tool, apply `context-budget` to scope before reading, and apply `strategic-compact` to decide whether compact/handoff is useful at the current phase. For every UI task, load `impeccable` and `gpt-taste` together, then consult the registry UI/UX Skill Pool and load every additional UI/UX skill that materially applies to visual design, frontend implementation, accessibility, responsiveness, motion, Figma/image-to-code, platform UI, UI QA, or UI performance. Restart Codex/new chat after installing skills so the session can auto-detect them.

## 0.1. Current Production Runbook And GitHub Actions

Detailed next setup runbook:

```text
D:\Study\KLTN\docs\SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md
```

GitHub Actions workflows at repo root:

```text
.github/workflows/smart-health-ci.yml
.github/workflows/deploy-web-admin.yml
```

Open Actions:

```text
https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions
```

Last observed passing CI run for this setup slice:

```text
https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/runs/27100213174
```

`Smart Health CI` runs on push, pull request, or manual dispatch and checks:

- backend `npm run check`
- backend `npm run smoke:workspace-access`
- backend `npm run check:production` report
- Web Admin `npm run build:firebase`
- Android `:app:compileDebugKotlin`
- ESP32-S3 `platformio run -e esp32-s3-devkitm-1`
- ESP32-S3 `platformio run -e esp32-s3-ota`

`Deploy Web Admin` is manual and deploys `https://shcare-admin.web.app` after these GitHub repository secrets exist:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
VITE_FIREBASE_API_KEY
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

`VITE_FIREBASE_MEASUREMENT_ID` is optional for runtime if Analytics is not used, but the other four are required by the deploy workflow.

## 1. Backend - `web-monitor`

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
```

Run local backend with Firebase auth and JSON demo state:

```powershell
$env:AUTH_MODE="production"
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
$env:DATA_BACKEND="json"
npm start
```

If admin web login shows `Phiên đăng nhập Firebase không hợp lệ hoặc đã hết hạn`, check the backend was started with the Firebase env above. Also verify the JSON demo user email maps to the current Firebase UID. The 2026-05-26 repair set `nguyengiabao100624@gmail.com` to UID `YOPbEgWu4pfRjMsbb8X5zOFBwUx1`, and backend login now self-heals stale stored UIDs when the verified token email matches.

If a platform/system admin login shows the hospital-admin Workspace Portal UI, verify the Firebase custom claims first. Platform admin claims should be `role=admin` and `smartHealth.role=admin`, or `platform_admin`. Backend fix on 2026-06-07 makes those claims resolve to backend `role=admin` before workspace normalization. After pushing/deploying that fix, sign out and sign in again so Firebase sends a fresh ID token; `/api/me` should then return `role=admin` and `platform.*` capabilities.

If `shcare.web.app` says an account should use admin but `shcare-admin.web.app` says it is not admin, check the backend role/surface result before changing accounts. On 2026-07-01 this happened because Firebase custom claims said `doctor` but backend returned the user as `patient/android`; backend commit `be70b551` now self-heals trusted Firebase `doctor` claims into approved portal access. After deploy, `baobee100624@gmail.com` returned `role=doctor`, `roleRequestStatus=approved`, `allowedSurfaces=["portal","android"]`, and workspace `Bệnh viện Quân y 175`.

If `https://shcare-admin.web.app/` still shows the old admin shell or access-denied screen instead of redirecting to `/login` while unauthenticated, the browser is likely serving an old SPA bundle. Hosting was updated on 2026-06-08 to send `Cache-Control: no-cache, no-store, must-revalidate`; do one hard refresh (`Ctrl+F5`) or open an incognito window, then `/` should redirect to `/login`.

Backend syntax/check:

```powershell
npm run check
```

Last verified on 2026-06-07 after the production RBAC persistence migrations and production role smoke script: passed.

Public deployment smoke without secrets:

```powershell
npm.cmd run smoke:public-deployment
```

Defaults:

```text
SMOKE_BACKEND_URL=https://smart-health-api-r5is.onrender.com
SMOKE_ADMIN_URL=https://shcare-admin.web.app
SMOKE_PORTAL_URL=https://shcare.web.app
SMOKE_REQUEST_TIMEOUT_MS=60000
```

This checks Render `/api/health`, verifies unauthenticated `/api/me` returns `401`, verifies Firebase Hosting rewrites `/login` and `/admin-actions` to the Web Admin SPA shell, and verifies Shcare Portal `/login` plus `/portal/patients` rewrites. The default timeout is 60 seconds to avoid false failures when the Render backend cold-starts.

Production readiness check:

```powershell
npm.cmd run check:production
npm.cmd run check:production:strict
```

`check:production` prints a deployment checklist and exits normally. `check:production:strict` exits nonzero if required production items are missing. In the current local/demo env it is expected to report `BLOCKED` until real third-party setup is supplied.

Production Firebase role/RBAC smoke against the deployed backend:

```powershell
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
npm.cmd run smoke:production-roles
```

This creates or updates Firebase smoke accounts, signs in through Firebase REST, calls the Render backend `/api/auth/firebase` and `/api/me`, and verifies:

- `platform.admin.smoke@smarthealth.test` returns backend `role=admin` and `platform.*` capabilities.
- `workspace.admin.smoke@smarthealth.test` returns backend `role=workspace_admin` and no `platform.*` capabilities.
- `doctor.portal.smoke@smarthealth.test` returns backend `role=doctor`, `roleRequestStatus=approved`, `allowedSurfaces=["portal","android"]`, `defaultSurface=portal`, and no `platform.*` capabilities.

The generated smoke-account passwords are saved locally in ignored file `web-monitor\.test-data\production-role-smoke-credentials.json`.

Authenticated portal production API smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:production-roles
npm.cmd run smoke:portal-production
```

Run `smoke:production-roles` first so the temporary smoke credentials are current. `smoke:portal-production` signs into Firebase with those smoke accounts, verifies live Render blocks platform admins from the portal, and checks workspace-admin/doctor portal read paths. It does not print passwords or ID tokens. This is an API-level live smoke; pair it with Shcare Web `bun run smoke:portal-browser` for browser-level live portal coverage. Mutation browser E2E still needs a controlled test plan that creates and restores/deletes test data.

Firebase email verification action-link smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
npm.cmd run smoke:firebase-email
```

This creates a temporary Firebase user, generates an email-verification action link for `https://shcare.web.app/xac-nhan-email`, checks that the link contains an OOB verification code, then deletes the temp user. It does not send email and does not print the OOB link.

Notification push delivery smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:notification-push
```

This starts a temporary JSON backend, logs in a seeded demo user, registers a fake Android FCM token, creates a direct user notification, and verifies the local no-Firebase case records `pushStatus=skipped` plus `pushAttempts[0].status=skipped` instead of crashing. Real FCM delivery still requires the deployed backend to have Firebase Admin configured and a real Android device token registered through `/api/v1/notifications/register-device`.

Optional retry tuning for real provider delivery:

```powershell
$env:PUSH_NOTIFICATION_MAX_RETRIES="1" # default 1, capped 0-3
$env:PUSH_NOTIFICATION_RETRY_MS="30000" # default 30000, bounded 1000-300000
```

`pushAttempts` stores provider attempt history without raw FCM tokens; token references are short SHA-256 hashes.

Shcare Web registration email delivery now uses backend endpoint:

```text
POST /api/v1/auth/email-verification
Authorization: Bearer <Firebase ID token>
```

Backend behavior:

- If Firebase already marks the user email verified, returns `status=verified`.
- Otherwise generates a Firebase Admin email-verification link and sends a branded email through `sendEmail()` using Brevo API or SMTP.
- Never returns the OOB verification link to the browser.
- Returns explicit configuration errors if Firebase authorized domains/action link settings or outbound email provider envs are missing.

Render/live env required for real inbox delivery:

```text
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<Brevo API key>
BREVO_FROM_EMAIL=<verified sender email>
BREVO_FROM_NAME=Smart Health
WEB_PORTAL_URL=https://shcare.web.app
```

Optional:

```text
FIREBASE_AUTH_LINK_DOMAIN=<Firebase Hosting link domain>
```

`WEB_PORTAL_URL` controls the continue URL used in Firebase action-code settings. Keep `shcare.web.app` in Firebase Console > Authentication > Settings > Authorized domains. If a registration says the profile/workspace request was saved but verification email was not sent, check Render envs above first; do not claim the email was sent until the endpoint returns `status=sent`.

Platform-only readiness API used by Web Admin Settings > `Triển khai`:

```text
GET /api/v1/settings/production-readiness
```

Third-party setup guide:

```text
D:\Study\KLTN\docs\SMART_HEALTH_THIRD_PARTY_SETUP.md
```

Workspace/RBAC HTTP smoke test with real temporary accounts:

```powershell
npm run smoke:workspace-access
```

This seeds `.test-data/workspace-access`, starts a temporary backend on port `3432`, logs in `platform_admin`, `workspace_admin`, `doctor`, `patient`, `technician`, `billing`, and `viewer`, then verifies workspace scoping, `/me` current-workspace and membership operational summaries, storage share URL generation, authenticated local-object URL reads, direct storage download content, cross-workspace signed URL/download denials, upload/list/download/delete cleanup, export download, package edit denial, technician device pairing, doctor claim-code device pairing with no-code creation denial, device-event history scope, portal notification delete, patient/family profile isolation, patient consent create/list/revoke with revoked-history visibility, patient backend password change with old-password rejection/new-password login, patient 2FA enable/disable setup with recovery-code response, AI chat tenant isolation, workspace-scoped AI settings/update notifications, and Android data summary/cache scoping.

Last verified on 2026-07-07 after the storage signed-URL/download coverage expansion: passed. A separate 2026-06-05 runtime smoke on temporary ports `PORT=3450` and `AUDIO_UDP_PORT=3451` also passed `/api/health`, WebSocket `/app`, and UDP audio packet checks.

Doctor signup catalog smoke after restarting backend. `/api/catalog/clinics` includes admin-created active clinics plus the built-in hospital catalog used by Android signup search:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/clinics
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/specialties
```

Doctor approval request-info sync checks:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd test

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build

cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

Workspace owner approval lifecycle checks:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd test

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run lint

cd D:\Study\KLTN\smart-health-web
bunx tsc --noEmit --pretty false
```

`npm.cmd test` now covers workspace-owner registration through `/api/auth/workspace-request`, admin `needs_info`, workspace resubmit, rejection, second resubmit, approval, and final portal surface access.

Doctor profile resubmit and solo-practice regression checks:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd test

cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build:firebase
```

This regression covers:

- request-info `needs_info -> pending` resubmit staying pending after `/api/auth/firebase` polling.
- updated doctor `phone`, `name`, `license`, `hospital`/private clinic, `department`, and `registrationReason` showing in admin pending list.
- solo doctor requests preserving `workspaceType=solo_practice`, `accountType=solo_doctor`, updated private clinic name, and updated phone.
- Android needs-info form deriving doctor type from backend metadata instead of exposing `Loại đăng ký`, while private doctors can still type `Tên phòng khám tư`.
- Android needs-info polling not overwriting form edits while the user is still updating the request.
- Web Admin production build accepting the `Bác sĩ tư/Bác sĩ cơ sở` display fields.

Doctor account lock/unlock regression checks:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd test

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
```

`npm.cmd test` covers an approved doctor lifecycle: approve, lock, keep the doctor row visible as `accountStatus=locked`, block the old bearer session, block new login while locked, unlock, and allow login again.

Android Firebase email verification regression checks:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s emulator-5554 logcat -c
.\gradlew.bat :app:installDebug
& $adb -s emulator-5554 shell am start -n com.example.smart_health_android/.MainActivity
Start-Sleep -Seconds 6
& $adb -s emulator-5554 logcat -d -b crash
```

Android doctor-login recovery regression checks:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:installDebug

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s emulator-5554 shell am start -n com.example.smart_health_android/.MainActivity
& $adb -s emulator-5554 logcat -d -b crash
```

Manual E2E target: create a private doctor account, verify Firebase email, then log in in doctor mode. If the device still has the full pending registration, `LoginScreen` should resubmit `/api/auth/role-request` and route to the pending approval screen instead of showing "Tài khoản này chưa được cấp quyền bác sĩ".

If Android shows "Email đã xác thực nhưng chưa gửi lại được hồ sơ bác sĩ", verify the deployed backend includes the solo-practice workspace upsert fix in `/api/auth/role-request`. The fixed backend must upsert the private clinic/workspace before repository-backed user persistence; otherwise Postgres can reject the new `organization_id` and Android cannot truthfully route to pending approval.

Manual Firebase expectation: after a user clicks the Firebase email-verification link, reopening the app or tapping `Tôi đã xác thực email` should reload Firebase state, then either continue to backend auth/role-request or show a specific backend/session error. `Gửi lại email xác thực` should reload first; if Firebase already marks the account verified, it should tell the user to continue instead of claiming another email was sent.

Optional emulator smoke on this Windows machine, when `adb` is not in PATH:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
cd D:\Study\KLTN\smart-health-android
& $adb devices
& $adb -s emulator-5554 logcat -c
.\gradlew.bat :app:installDebug
& $adb -s emulator-5554 shell am start -n com.example.smart_health_android/.MainActivity
Start-Sleep -Seconds 5
& $adb -s emulator-5554 logcat -d -b crash
& $adb -s emulator-5554 exec-out uiautomator dump /dev/tty
```

Manual E2E expectation for `request-info`:

- Admin opens Web Admin Doctor Approval, requests more information for a pending doctor, and receives success.
- The changed row moves to the `needs_info` tab immediately, without waiting for a full page reload.
- Backend returns the doctor user with `roleRequestStatus = "needs_info"`, `roleInfoRequestMessage`, and `roleInfoRequiredFields`.
- Android doctor pending screen refreshes within about 15 seconds, shows the admin message, and lists the required fields.
- When the doctor taps update/resubmit, backend must persist `roleRequestStatus = "pending"` and clear `roleInfoRequestMessage` plus `roleInfoRequiredFields`; a later `/api/auth/firebase` poll must still return `pending`, not fall back to `needs_info`.
- Admin `pending` list should contain the doctor after resubmit, and `needs_info` should no longer contain that doctor.
- Notification list treats `doctor_info_requested` as a warning/info-required notification.

2026-06-12 deploy evidence for this flow:

- Git commit pushed for backend/Web Admin source: `4e8548e Fix doctor request info sync`.
- Firebase Hosting Web Admin release: `projects/162993928259/sites/shcare-admin/versions/f13b8b22666bc3cd`.
- Render canary after auto-deploy: unauthenticated `GET https://smart-health-api-r5is.onrender.com/api/share-targets?q=test` returns `401` instead of old `404`.
- Final public smoke: `npm.cmd run smoke:public-deployment` passed.
- Stale-profile/solo-practice follow-up deploy: Git commit `72b0f3d Fix doctor resubmit profile flow` pushed to `origin/main`, Firebase Hosting release `projects/162993928259/sites/shcare-admin/versions/7de2656be1036977`, public deployment smoke passed, and authenticated Render doctor-request schema canary confirmed `workspaceType`, `accountType`, `clinicSuggestion`, `registrationReason`, `phone`, and `hospital`.
- Follow-up commits after live stale-pending report: `951c82c Persist doctor info requests in postgres` and `7f1cdef Fix doctor request timestamp persistence`.
- Root cause: repository saves were passing empty strings to Postgres `timestamptz` columns and falling back silently, so the request-info response looked successful while SQL-backed list APIs still returned `pending`.
- Production verification command pattern: sign in as platform smoke admin, POST `/api/admin/doctor-requests/:id/request-info`, then verify `GET /api/admin/doctor-requests?status=pending` is empty for that user and `status=needs_info` contains it. For Android parity, create a Firebase token for the doctor UID with `FIREBASE_SERVICE_ACCOUNT_JSON` and verify `/api/auth/firebase` returns `roleRequestStatus = needs_info`.
- Resubmit follow-up verification: with the doctor Firebase token, POST `/api/auth/role-request` with the corrected doctor profile payload, wait at least the Android polling interval, then verify `/api/auth/firebase` still returns `roleRequestStatus = pending`, `roleInfoRequestMessage = ""`, and `roleInfoRequiredFields = []`. Also verify admin `status=pending` contains the user and `status=needs_info` does not.
- Registration reason verification: submit `/api/auth/role-request` from Android or an authenticated doctor token with a unique `reason`, then verify `/api/auth/firebase` returns `user.registrationReason`, `GET /api/admin/doctor-requests?status=pending` shows the same `registrationReason`, Web Admin Doctor Approval renders it in the reason field, and the platform-admin Gmail notification metadata includes `Lý do đăng ký` plus a CTA to `/doctor-approval`.
- Local regression coverage for this path is in `npm.cmd test`; it checks first submit, admin request-info, doctor resubmit, auth polling, and admin pending list all preserve the expected `registrationReason`.
- 2026-06-12 production canary after commit `4ce7915`: `baobee1006@gmail.com` returned `roleRequestStatus = pending`, admin pending list showed the exact canary `registrationReason`, notification metadata contained the same reason, Firebase Hosting Web Admin version `5124335308359eb3` was live, and `npm.cmd run smoke:public-deployment` passed.

Doctor delete behavior: web admin `DELETE /api/admin/doctors/:id` requires Firebase Admin env when the doctor has `firebaseUid`. The backend deletes the Firebase Auth user first, then removes backend user/session/membership/device-token/access links. If Firebase deletion fails, the API returns an error and backend data is not reported as successfully deleted.

Clinic management behavior: web admin uses `POST /api/admin/clinics` to create, `PATCH /api/admin/clinics/:id` to edit or toggle `status=inactive|active`, and `DELETE /api/admin/clinics/:id` to delete. Delete is rejected while the clinic still has doctors, patients, or devices.

Workspace/package behavior: new code should treat `organizationId` as `workspaceId` while keeping old route compatibility. `GET /api/admin/workspaces` returns the same workspace list as `GET /api/admin/clinics`, including `workspaceType`, usage, quota, package, and subscription fields. Service package CRUD is available through `GET|POST /api/admin/packages`, `PATCH|DELETE /api/admin/packages/:id`, and assignment through `POST /api/admin/workspaces/:id/package`.

Workspace smoke examples:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/admin/workspaces
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/admin/packages
```

Cloud device API shape:

- `POST /api/v1/devices/:id/commands` sends backend-mediated commands such as `restart`, `wifi.status`, `device.lock`, `device.revoke`, or future control messages.
- `POST /api/v1/devices/:id/ota` creates a cloud OTA command. Body can include either `firmwareVersion`, `url`/`downloadUrl`, and optional SHA-256 `checksum`, or `firmwareFileId` for a `.bin` uploaded to bucket `device-firmware`.
- When `firmwareFileId` is used, backend creates `/api/v1/devices/:id/ota/:otaId/firmware?token=...` for the ESP. The tokenized URL is intentionally hidden from normal device API responses.
- `GET /api/v1/devices/:id/events` returns recent heartbeat, command, OTA, disconnect, and error events.
- The ESP connection is outbound to backend WebSocket/WSS. The web/app does not need to be on the same WiFi/LAN as the ESP.
- The browser realtime monitor at `/listen` or `/app` can pass `?token=<Firebase ID token or backend session token>` or `?access_token=...`. In production, do not expect an anonymous listener to work.
- Production backend no longer auto-seeds demo users, organizations, devices, or notifications when `AUTH_MODE=production`. If the production database is empty, create real workspace/device records through the setup flow instead of expecting sample rows.
- Scan creation/recording now needs an explicit `deviceId` in production. Demo fallback device selection only remains for non-production use.

If `npm run check` is unavailable or broken, fall back to:

```powershell
node --check server.js
Get-ChildItem .\src -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Useful smoke commands if scripts exist in current checkout:

```powershell
npm run smoke:storage
npm run smoke:api-production
npm run smoke:workspace-access
npm run smoke:postgres
npm run smoke:mqtt
```

Do not assume these smoke scripts exist; check `package.json` first.

`npm run smoke:storage` passed on 2026-06-06 after storage uploads started recording firmware SHA-256/version metadata for cloud OTA.

As of 2026-07-07, `npm run smoke:workspace-access` is the stronger storage API contract smoke for local JSON/local-object mode because it goes through authenticated HTTP routes instead of only the storage adapter. Real S3/Supabase Storage provider smoke still requires the provider env vars loaded into the shell or host running the smoke.

Production CORS after Firebase Hosting domains are active:

```powershell
# Render backend env
CORS_ORIGIN=https://shcare-admin.web.app,https://shcare.web.app
```

Backend supports comma-separated CORS origins. `https://shcare-admin.web.app` is Platform Admin Console; `https://shcare.web.app` is Shcare Web Portal for doctors and clinics/facilities.

## 2. Web Admin

Working directory:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
```

Run against production/Firebase backend config:

```powershell
npm run dev:prod -- --host 127.0.0.1 --port 5174
```

Build check:

```powershell
npm run build
```

Last verified in this workspace on 2026-07-07 after the backend tenant-hardening push and Admin mutation smoke rerun. `npm.cmd run lint` passed, `npm.cmd run build:firebase:admin` passed, `npm.cmd run smoke:admin-mutation` passed against live Render/Admin, and Firebase Hosting site `shcare-admin` was deployed as version `projects/162993928259/sites/shcare-admin/versions/ce26044bb3730062`. The remaining TanStack build messages are dependency unused-import warnings from `node_modules`; the remaining large `xlsx` asset is a lazy export-library chunk.

Firebase Hosting production domains:

- Platform Admin Console: `https://shcare-admin.web.app`
- Shcare Web Portal: `https://shcare.web.app`

Build Platform Admin for Firebase Hosting:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build:firebase:admin
```

Build Shcare Web Portal for Firebase Hosting:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build:firebase:portal
```

Deploy Web Admin to Firebase Hosting target `admin`:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
$env:npm_config_cache="D:\Study\KLTN\.npm-cache"
npm.cmd run deploy:firebase:admin
```

Deploy Shcare Web Portal to Firebase Hosting target `webapp`:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
npx firebase-tools@latest deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

HTTP smoke after deploy:

```powershell
Invoke-WebRequest -UseBasicParsing https://shcare-admin.web.app/login
Invoke-WebRequest -UseBasicParsing https://shcare.web.app/login
cd "D:\Study\KLTN\smart-health-embedded\web-monitor"
npm.cmd run smoke:public-deployment
```

Controlled live Web Admin mutation smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
npm.cmd run smoke:production-roles

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run smoke:admin-mutation
```

`smoke:admin-mutation` reads `smart-health-embedded\web-monitor\.test-data\production-role-smoke-credentials.json` by default and uses the `platform` account. Optional overrides are `SMOKE_ADMIN_URL`, `SMART_HEALTH_API_BASE_URL` or `SMOKE_API_BASE_URL`, `SMOKE_CREDENTIALS_FILE`, and `SMOKE_ACCOUNT_KEY`. It does not print passwords or bearer tokens. Coverage includes platform workspace/package/patient/device/notification/storage/settings mutations with cleanup, plus route checks for overview, devices, patients, clinics, packages, notifications, storage, settings, admin accounts, and audit log. Last live pass from this workspace used run id `admin-mutation-mran2ji6` after repository list hydration fix commit `27f309be`; device PATCH returned 200 and all created/restored resources cleaned up with HTTP 200 responses.

Expected state:

- `shcare-admin.web.app/login` returns 200 and shows Smart Health Admin login; doctor/clinic accounts should be blocked with CTA to `shcare.web.app`.
- `shcare.web.app/login` returns 200 and shows Shcare Web Portal login; platform admin accounts should be directed back to `shcare-admin.web.app`.
- Chrome smoke on 2026-06-07 logged in with `platform.admin.smoke@smarthealth.test`, showed `Platform Admin Console`, had no console messages after hard reload, and backend calls to `/api/me`, notifications, overview stats, and devices returned 200.

If the UI still shows stale data after frontend edits, restart Vite or hard-refresh the browser.

Device management in Web Admin:

- Use the main Web Admin Devices page, not `smarthealth-xxxxxx.local/admin`, for normal operations.
- The Devices page shows backend-derived online/offline, heartbeat, WiFi/IP/RSSI, firmware, audio, OTA status, latest command, and event timeline.
- Cloud OTA can select an uploaded `.bin` from bucket `device-firmware` to prefill firmware version/checksum, or use a manual firmware URL/checksum fallback.

## 3. Android

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-android
```

Compile Kotlin:

```powershell
.\gradlew.bat :app:compileDebugKotlin
```

Last verified on 2026-06-05 for KLTN evidence, again on 2026-06-06 after Android cloud device status/live audio auth changes, again on 2026-06-09 after Android FCM/profile/avatar/notification-preference cleanup, again on 2026-06-11 after the doctor signup catalog-picker fix, and again on 2026-07-09 after Android workspace switcher/context parsing: passed. Gradle installed Android SDK Build-Tools 36 and Android SDK Platform 36 during the earlier evidence run.

Full assemble debug when needed:

```powershell
.\gradlew.bat :app:assembleDebug
```

Last verified on 2026-06-05 for KLTN evidence, again on 2026-06-09 after Android FCM/profile/avatar/notification-preference cleanup, again on 2026-06-11 after the doctor signup catalog-picker fix, and again on 2026-07-09 after Android workspace switcher/context parsing: passed. The debug APK installed and launched on emulator `Pixel_8_Pro_2`; 2026-06-09 smoke also verified direct `MainActivity` launch, phone-login UI, Android notification permission prompt, and empty crash buffer. The 2026-07-09 workspace switcher pass was source/build/unit-test only; emulator visual proof is still pending.

Host safety update for `Pixel_8_Pro_2` on 2026-07-09: do not start this emulator normally from automation. Boot attempts correlated with repeated Windows bugcheck `0x00000133` (`DPC_WATCHDOG_VIOLATION`), and `qemu-system` appeared in the latest minidump string scan. The AVD data was moved from C to `D:\Android\avd\Pixel_8_Pro_2.avd`, and `C:\Users\baobe\.android\avd\Pixel_8_Pro_2.ini` now points to that D path. Android Emulator Hypervisor Driver `aehd` was stopped and changed from system start to demand start. Prefer a real attached Android device for FCM/visual proof; if an emulator is unavoidable, use a deliberately conservative software-only run and stop immediately on any driver warning.

Unit test target used for Android account/workspace source slices:

```powershell
.\gradlew.bat :app:testDebugUnitTest
```

Last verified on 2026-07-09 after Android workspace switcher/context parsing: passed.

Emulator install/launch/screenshot evidence pattern used on 2026-06-05:

```powershell
$adb="C:\Users\baobe\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$apk="D:\Study\KLTN\smart-health-android\app\build\outputs\apk\debug\app-debug.apk"
& $adb install -r $apk
& $adb shell am start -n com.example.smart_health_android/.MainActivity
& $adb shell screencap -p /sdcard/smart-health-launch.png
& $adb pull /sdcard/smart-health-launch.png "D:\Study\KLTN\docs\report-evidence\2026-06-05\screenshots\android\01-android-launch.png"
```

Use Android Studio/emulator/device for end-to-end login and doctor approval flow.

Android emulator smoke used on 2026-06-09:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleDebug --console=plain
$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb install -r app\build\outputs\apk\debug\app-debug.apk
& $adb shell am force-stop com.example.smart_health_android
& $adb logcat -c
& $adb shell am start -n com.example.smart_health_android/.MainActivity
& $adb shell uiautomator dump /sdcard/final-smoke.xml
& $adb pull /sdcard/final-smoke.xml .\build\final-smoke.xml
& $adb logcat -d -b crash
```

Android demo/no-op audit used on 2026-06-09:

```powershell
cd D:\Study\KLTN\smart-health-android
rg -n "Math\.random|android-app|pat_demo|demo là|OTP demo|Mã xác thực demo|fake|mock|Tuân Thủ HIPAA|FDA Cấp|FDA cấp|HIPAA|clickable \{ /\*|onClick = \{ \}|/\* Upload avatar \*/|/\* Download \*/|/\* Seek \*/|123456" app\src\main\java app\src\main\res -S
```

Expected: no output.

Doctor signup catalog picker smoke used on 2026-06-11:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin --console=plain
.\gradlew.bat :app:assembleDebug --console=plain
$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb install -r app\build\outputs\apk\debug\app-debug.apk
& $adb shell am force-stop com.example.smart_health_android
& $adb logcat -c
& $adb shell am start -n com.example.smart_health_android/.MainActivity

# Manual/ADB smoke:
# 1. Tap "Đăng ký ngay".
# 2. Tap "Bác sĩ cơ sở".
# 3. Tap "Chuyên khoa"; dialog must open even if backend catalog is unavailable.
# 4. Back, then tap "Cơ sở y tế"; dialog must open with retry/empty state.
& $adb shell uiautomator dump /sdcard/signup-picker-smoke.xml
& $adb shell cat /sdcard/signup-picker-smoke.xml
& $adb logcat -d -t 250 | Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime|com.example.smart_health_android|Exception|ANR"
```

Expected when backend catalog is unavailable: the field text says `Không tải được ... - bấm để thử lại`; tapping opens a dialog with the backend error and `Tải lại danh mục`. There must be no app `FATAL EXCEPTION`.

## 4. Firmware - MSM261S4030H0

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
```

PlatformIO path on this machine:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe
```

Build default firmware:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

Build both normal and OTA PlatformIO environments:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-ota
```

Last verified on 2026-07-02 after end-to-end validation: MSM261 normal and OTA environments passed. Approximate result for the current build was RAM 15.7%, flash 29.7%.

Upload when board is on the configured COM port:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run --target upload
```

Monitor:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe device monitor
```

Device discovery check:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe device list
```

On 2026-06-05 this only detected COM3/COM4 Bluetooth serial links. COM6/ESP32-S3 was not detected, so physical upload/serial monitor evidence was not captured in that evidence set.

Cloud-first firmware configuration:

- First wired flash is still required at least once unless the device already has a working firmware and credentials.
- Provide WiFi/backend/device values through local build flags or NVS/runtime config. Do not commit real WiFi passwords, backend secrets, or device secrets.
- Relevant build flags in `MSM261S4030H0\platformio.ini`:
  - `SMART_HEALTH_WIFI_SSID`
  - `SMART_HEALTH_WIFI_PASS`
  - `SMART_HEALTH_BACKEND_HOST`
  - `SMART_HEALTH_BACKEND_PORT`
  - `SMART_HEALTH_BACKEND_TLS`
  - `SMART_HEALTH_DEVICE_ID`
  - `SMART_HEALTH_DEVICE_SECRET`
  - `SMART_HEALTH_FIRMWARE_VERSION`
- `SMART_HEALTH_AUDIO_HOST` and `SMART_HEALTH_AUDIO_UDP_PORT` are optional local UDP development fallback only.

Example local build flags to put temporarily in an ignored/local working copy before flashing:

```ini
build_flags =
  -DSMART_HEALTH_WIFI_SSID=\"YourWiFi\"
  -DSMART_HEALTH_WIFI_PASS=\"YourPassword\"
  -DSMART_HEALTH_BACKEND_HOST=\"api.smart-health.example.com\"
  -DSMART_HEALTH_BACKEND_PORT=443
  -DSMART_HEALTH_BACKEND_TLS=1
  -DSMART_HEALTH_DEVICE_ID=\"smarthealth-ABCDEF\"
  -DSMART_HEALTH_DEVICE_SECRET=\"device-secret-issued-by-web-admin\"
  -DSMART_HEALTH_FIRMWARE_VERSION=\"1.0.0\"
```

Local WiFi recovery portal:

- If WiFi is missing or connection fails, the ESP opens AP `SmartHealth-<suffix>`.
- Connect a phone/laptop to that AP and open `http://192.168.4.1`.
- The page only saves WiFi SSID/password. It does not expose OTA password, backend host, device secret, ownership, restart, browser firmware upload, or admin settings.
- After WiFi reconnects and the device has Internet, management returns to the main Web Admin through backend cloud.

Cloud OTA production flow:

1. Build firmware `.bin`.
2. Upload the `.bin` to Web Admin Storage bucket `device-firmware`, or host it through a HTTPS URL reachable by the ESP.
3. Backend storage upload computes SHA-256 and infers firmware version from the filename when possible. For manual URLs, compute and paste the SHA-256 checksum yourself.
4. In Web Admin Devices, select the target device and choose the uploaded firmware file, or paste manual firmware version/URL/checksum.
5. If a storage file is selected, backend creates a short-lived tokenized firmware download URL for the ESP and sends that URL through the cloud OTA command.
6. ESP receives the command through the outbound backend WebSocket/WSS connection, downloads the file, verifies SHA-256 when provided, writes OTA partition, emits OTA events, and reboots.

LAN ArduinoOTA/espota:

- This is dev-only and not the product OTA path because it requires the laptop and ESP to be on the same LAN.
- It is disabled by default.
- Enable only for internal debugging with:

```ini
build_flags =
  -DSMART_HEALTH_ENABLE_LAN_OTA=1
  -DSMART_HEALTH_OTA_PASSWORD=\"local-dev-ota-password\"
```

- Keep the real LAN OTA password out of source. For KLTN/product demo, prefer cloud OTA from Web Admin.

## 4.1. Firmware Scope

INMP441 is retired from the current product scope. Use only:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
```

Physical-board smoke still requires a real ESP32-S3 connected over COM, valid WiFi, and a device id/secret provisioned in Web Admin.

## 5. Firebase Admin Claims

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
```

Set env:

```powershell
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
```

Set custom claims:

```powershell
npm run firebase:claims -- <UID> admin org_default_clinic
npm run firebase:claims -- <UID> doctor org_default_clinic
npm run firebase:claims -- <UID> patient org_default_clinic
```

After changing claims, the user must sign out and sign in again or force refresh the Firebase ID token. Old tokens do not immediately receive new claims.

Known admin UID used during setup:

```text
fQwjTYSCBOdGU5Hd0jbC1hkaaze2
```

## 6. Local AI/MCP Tooling

Check MCP servers:

```powershell
codex mcp list
```

Expected MCP entries:

- `chrome-devtools`
- `codegraph`
- `codebase-memory`
- `context7`

Best-effort claude-mem check/start for new Smart Health chats:

```powershell
try { Invoke-WebRequest -UseBasicParsing http://localhost:37777 -TimeoutSec 2 | Out-Null; "claude-mem running" } catch { Start-Process -FilePath "cmd.exe" -ArgumentList @('/c','npx','claude-mem','start') -WindowStyle Hidden; "claude-mem start requested" }
```

Manual claude-mem worker start:

```powershell
npx claude-mem start
```

Open memory viewer:

```text
http://localhost:37777
```

Check Context7 login:

```powershell
npx -y ctx7 whoami
```

Use Context7 docs lookup:

```powershell
npx -y ctx7 library React "hooks and useEffect"
npx -y ctx7 docs /facebook/react "useEffect examples"
```

Use skills search/install only when needed:

```powershell
npx -y ctx7 skills search "code review"
npx -y skills find "code review"
```

Smart Health project skill location:

```text
C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md
```

The old `D:\Study\KLTN\docs\.ai_skills` folder was consolidated into this global Codex skill to avoid scattering duplicated skill files across the project.

Selected global skills for this workspace:

```text
C:\Users\baobe\.agents\skills\academic-research-suite
C:\Users\baobe\.agents\skills\gpt-taste
C:\Users\baobe\.agents\skills\context-budget
C:\Users\baobe\.agents\skills\strategic-compact
C:\Users\baobe\.agents\skills\agent-reach
C:\Users\baobe\.agents\skills\impeccable
```

Default routing rule: the assistant should infer the right skill/tool from the task and registry. The user does not need to name exact skills. Load full `context-budget` and `strategic-compact` only for non-trivial, broad, long-running, multi-repo, or tooling/audit work; trivial tasks use the short checklist.

Impeccable global smoke/setup command pattern:

```powershell
node C:\Users\baobe\.agents\skills\impeccable\scripts\context.mjs --target D:\Study\KLTN\smart-health-web
```

If it reports `NO_PRODUCT_MD`, follow the `impeccable` `init` workflow at the start of the first real UI task. The automated detector hook remains optional and project-specific; the global skill itself requires no project-local copy.

UI/UX Skill Pool routing after the mandatory `impeccable` + `gpt-taste` pair:

- Web/frontend implementation and UI QA: Build Web Apps `frontend-app-builder`, `frontend-testing-debugging`, `react-best-practices`, `shadcn`; global `frontend-design`, `design-html`, `design-review`, `design-consultation`, `design-shotgun`, `plan-design-review`, `prototype`, and Browser/Chrome checks.
- Specialized visual/Taste workflows: `redesign-existing-projects`, `image-to-code`, `imagegen-frontend-web`, `imagegen-frontend-mobile`, `minimalist-ui`, `industrial-brutalist-ui`, `high-end-visual-design`, `brandkit`, `stitch-design-taste`, `full-output-enforcement`.
- Figma/design-source workflows: `figma-use`, `figma-generate-design`, `figma-generate-library`, `figma-code-connect`, `figma-implement-motion`, `figma-use-motion`, `figma-swiftui`, and related Figma artifact skills.
- Native/mobile UI workflows: `ios-design-review`, `ios-qa`, Build iOS Apps SwiftUI skills, `ios-simulator-browser`, Test Android Apps `android-emulator-qa`, and `android-performance`.
- Visual assets for UI: system `imagegen`, `generate-image`, and `infographics` when the interface needs generated imagery or presentation-grade visuals.

Agent Reach health check (restart the shell/Codex after first install so `gh` is on `PATH`):

```powershell
agent-reach doctor
gh auth login   # only when authenticated/private GitHub access is needed
```

## 7. CodeGraph

CodeGraph is installed as MCP. It is best for structural code questions.

If an index is missing or stale, run from the project root:

```powershell
cd D:\Study\KLTN\smart-health-embedded
codegraph init -i
```

Do not use CodeGraph for literal string search; use `rg`.

### Codebase Memory MCP

Use the second graph server for broad architecture, semantic/cross-repo queries, change detection, or persistent ADRs. Do not send the same question to both graph servers.

```powershell
codebase-memory-mcp --version
codebase-memory-mcp cli list_projects '{}'
```

The `smart-health-web` cache project is `D-Study-KLTN-smart-health-web`. Re-index from an MCP client with `index_repository` after large structural changes. Keep generated `.codebase-memory/` artifacts untracked unless the team explicitly chooses to share them.

## 8. Recommended Search Commands

Fast file search:

```powershell
rg --files
```

Find text:

```powershell
rg -n "pattern" .
```

Find likely mojibake:

```powershell
rg -n "Ã|Ä|áº|á»|â€|�" D:\Study\KLTN\smart-health-admin D:\Study\KLTN\smart-health-android D:\Study\KLTN\smart-health-embedded
```

Search route/API references:

```powershell
rg -n "/api/|api/v1|doctor-requests|notifications|storage|scans" D:\Study\KLTN\smart-health-embedded D:\Study\KLTN\smart-health-admin D:\Study\KLTN\smart-health-android
```

## 9. Context Maintenance Commands

Open/edit context docs:

```powershell
code D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md
code D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md
code D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md
code D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md
```

Quick context sanity check:

```powershell
rg -n "Last updated|Mandatory Context Maintenance|quota|token|Next Sprint|Known" D:\Study\KLTN\docs\SMART_HEALTH_*.md
```

Every code/config change that affects future work should update at least one of the context files. This is mandatory for the Smart Health project because it avoids repeated codebase scanning in future new chats.

Catalog smoke check:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/clinics
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/specialties
```

The backend catalog includes admin-created active clinics plus a built-in demo list of major hospitals/clinics, currently weighted toward TP.HCM for doctor signup testing.

## 10. Git Safety

Check current changes:

```powershell
git -C D:\Study\KLTN\smart-health-embedded status --short
```

Do not run destructive cleanup commands such as `git reset --hard`, `git checkout --`, or recursive deletes unless the user explicitly asks for that operation.

## 2026-06-05 Admin Basic Functions Verification Commands

PowerShell may block `npm.ps1`; use `npm.cmd` when that happens:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
node --check server.js
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
```

Local dev servers used for smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
node server.js
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run dev -- --host 127.0.0.1 --port 5174
```

Admin basic function audit:

```powershell
rg -n 'window\.confirm|alert\(' -S "D:\Study\KLTN\smart-health-admin\thiết kế giao diện\src"
```

Settings outbound envs expected by backend:

```powershell
$env:EMAIL_PROVIDER="brevo"
$env:BREVO_API_KEY="your-brevo-api-key"
$env:BREVO_FROM_EMAIL="verified-sender@example.com"
$env:BREVO_FROM_NAME="Smart Health"
$env:BREVO_API_URL="https://api.brevo.com/v3/smtp/email"
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your-gmail@gmail.com"
$env:SMTP_PASS="your-gmail-app-password"
$env:SMTP_FROM="Smart Health <your-gmail@gmail.com>"
$env:OUTBOUND_WEBHOOK_URL="https://your-webhook.example/smart-health"
$env:OUTBOUND_WEBHOOK_SECRET="optional-shared-secret"
```

Smoke endpoints after backend is running:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/me
Invoke-RestMethod http://127.0.0.1:3000/api/auth/sessions
Invoke-RestMethod http://127.0.0.1:3000/api/settings
$body=@{to='demo@example.com'} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:3000/api/settings/test-email -Method POST -ContentType 'application/json' -Body $body
$body=@{channel='sms';to='0900000000';message='Smart Health webhook test'} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:3000/api/settings/test-outbound -Method POST -ContentType 'application/json' -Body $body
```

Expected without env/config: test email returns 400 listing missing `BREVO_*` or SMTP fallback envs; SMS/Zalo test returns 400 when webhook URL is missing.

## 2026-06-06 Production Readiness And Third-Party Env

Use this after deploying or configuring any real provider:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run check:production
```

Use strict mode in deployment/CI:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check:production:strict
```

Current required production env shape:

```env
AUTH_MODE=production
ALLOW_DEMO_AUTH=false
FIREBASE_AUTH_ENABLED=true
FIREBASE_PROJECT_ID=smart-health-stethoscope
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-service-account.json
DATA_BACKEND=postgres
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
PUBLIC_BACKEND_URL=https://api.smart-health.example.com
PUBLIC_API_BASE_URL=https://api.smart-health.example.com/api/v1
CORS_ORIGIN=https://admin.smart-health.example.com
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_BUCKET=smart-health-production
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
PHI_ENCRYPTION_KEY=<64-hex-character-secret>
```

Optional but recommended:

```env
REDIS_URL=rediss://:<password>@<host>:6379
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<brevo-api-key>
BREVO_FROM_EMAIL=<verified-sender@example.com>
BREVO_FROM_NAME=Smart Health
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
# SMTP fallback only for paid hosts/local demos that allow SMTP.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=<gmail-app-password>
SMTP_FROM="Smart Health <your-gmail@gmail.com>"
OUTBOUND_WEBHOOK_URL=https://your-provider-or-relay.example.com/smart-health/outbound
OUTBOUND_WEBHOOK_SECRET=<shared-secret>
MQTT_URL=mqtts://<broker-host>:8883
MQTT_USERNAME=<username>
MQTT_PASSWORD=<password>
MQTT_CLIENT_ID=smart-health-backend
RATE_LIMIT_PER_MINUTE=300
```

Current Render backend created on 2026-06-06:

```text
https://smart-health-api-r5is.onrender.com
```

Health check:

```text
https://smart-health-api-r5is.onrender.com/api/health
```

Generate a `PHI_ENCRYPTION_KEY` locally:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes)
```

Web Admin production build after backend domain exists:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
cmd.exe /c "set ""VITE_AUTH_MODE=production"" && set ""VITE_SMART_HEALTH_BASE_URL=https://api.smart-health.example.com"" && set ""VITE_SMART_HEALTH_API_BASE_URL=https://api.smart-health.example.com/api"" && npm.cmd run build:product"
```

Android release build after Firebase Android setup and backend domain exist:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com
```

## 2026-06-06 Production Auth Smoke For Web Admin Login

When the web admin uses `VITE_AUTH_MODE=production`, start the backend with Firebase verification enabled. Do not use a demo-mode backend for login testing, because it can reject Firebase login flows or return misleading no-token demo admin data.

Run backend production/Firebase mode:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
cmd.exe /c "set ""AUTH_MODE=production"" && set ""FIREBASE_AUTH_ENABLED=true"" && set ""FIREBASE_PROJECT_ID=smart-health-stethoscope"" && set ""GOOGLE_APPLICATION_CREDENTIALS=D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"" && set ""DATA_BACKEND=json"" && node server.js"
```

Run web admin:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run dev:prod -- --host 127.0.0.1 --port 5174
```

Smoke expectations:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health

try {
  Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/me -ErrorAction Stop
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected: `/api/health` returns 200 and unauthenticated `/api/me` returns `401`. The backend log should include:

```text
Auth mode: production; Firebase auth: enabled
```

Browser smoke used on 2026-06-06:

- `http://127.0.0.1:5174/login` renders correct Vietnamese login text.
- Fake credentials call Firebase `accounts:signInWithPassword` and show `Email hoặc mật khẩu không đúng.`
- Real successful login still requires a valid Firebase admin account/password.
## 2026-06-06 Clinic Delete Diagnostics

Check why a workspace/clinic cannot be deleted in JSON mode:

```powershell
cd D:\Study\KLTN\smart-health-embedded
$env:PYTHONIOENCODING='utf-8'
@'
import json
from pathlib import Path
db = json.loads(Path(r"D:\Study\KLTN\smart-health-embedded\web-monitor\data\db.json").read_text(encoding="utf-8"))
clinic_id = "org_default_clinic"
for org in db.get("organizations", []):
    if org.get("id") == clinic_id:
        print("ORG", org.get("id"), org.get("name"))
        print("USERS", [(u.get("id"), u.get("role"), u.get("email"), u.get("name")) for u in db.get("users", []) if u.get("organizationId") == clinic_id])
        print("PATIENTS", [(p.get("id"), p.get("name"), p.get("ownerUserId")) for p in db.get("patients", []) if p.get("organizationId") == clinic_id])
        print("DEVICES", [(d.get("id"), d.get("name"), d.get("status")) for d in db.get("devices", []) if d.get("organizationId") == clinic_id])
'@ | python -
```

Expected current result for `Smart Health Clinic` / `org_default_clinic`: 4 linked accounts, 4 linked patients, 0 linked devices. `DELETE /api/admin/clinics/:id` should return `409 WORKSPACE_IN_USE` with details until those links are transferred or removed.

## 2026-06-06 Firebase Workspace Admin Smoke

Create or refresh a real Firebase workspace admin for local browser smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
$env:WORKSPACE_ADMIN_EMAIL="workspace.admin.demo@smarthealth.test"
$env:WORKSPACE_ADMIN_PASSWORD="change-this-local-demo-password"
$env:WORKSPACE_ADMIN_ORG_ID="org_workspace_demo_hospital"
$env:WORKSPACE_ADMIN_ORG_NAME="Bệnh viện Demo Workspace"
npm.cmd run firebase:create-workspace-admin
```

The script sets Firebase custom claims:

```json
{
  "role": "workspace_admin",
  "organizationId": "org_workspace_demo_hospital",
  "smartHealth": {
    "role": "workspace_admin",
    "organizationId": "org_workspace_demo_hospital"
  }
}
```

Preferred production/admin UI path:

- Sign in to Web Admin as a platform/system admin.
- Open `Hành động quản trị`.
- Choose `Tạo tài khoản admin`.
- Select `Admin bệnh viện` and a workspace, or `Admin toàn hệ thống`.
- Enter name, email, phone, and a temporary password with at least 8 characters.

The UI calls `POST /api/admin/admin-users`. The backend requires `platform.users.manage`, creates the Firebase Auth user, sets custom claims, saves the backend user/membership through the repository layer, rejects existing emails to avoid accidental password resets, and audits `admin.user.create`. Keep `npm.cmd run firebase:create-workspace-admin` only for local smoke/demo seeding.

Start backend in production Firebase mode:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
cmd.exe /c "set ""AUTH_MODE=production"" && set ""FIREBASE_AUTH_ENABLED=true"" && set ""FIREBASE_PROJECT_ID=smart-health-stethoscope"" && set ""GOOGLE_APPLICATION_CREDENTIALS=D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"" && set ""DATA_BACKEND=json"" && node server.js"
```

Start web admin:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run dev:prod -- --host 127.0.0.1 --port 5174
```

Workspace-admin browser smoke expectations:

- Login succeeds with the Firebase workspace-admin account.
- Sidebar/topbar/dropdown show `Admin bệnh viện`, `Bệnh viện Demo Workspace`, and `Bệnh viện`.
- Visible menu excludes platform-only pages: `Gói dịch vụ`, `Phòng khám`, `Duyệt bác sĩ`, Firebase sync/admin actions.
- Direct `/packages` and `/doctor-approval` show `Không có quyền truy cập`.
- `/doctors`, `/patients`, `/devices`, `/storage`, `/settings` show only workspace-scoped data.
- `/settings` heading is `Cài đặt bệnh viện`, and `/api/settings` returns `scope.type = "workspace"`.

Fast API smoke after logging in through Firebase Web Auth should show:

- `/api/me`: `role = workspace_admin`, `currentWorkspaceId = org_workspace_demo_hospital`.
- `/api/admin/clinics`: exactly `Bệnh viện Demo Workspace`.
- `/api/admin/doctors`: exactly `Bác sĩ Demo Workspace`.
- `/api/patients`: exactly `Bệnh nhân Demo Workspace`, `doctorName = Bác sĩ Demo Workspace`.
- `/api/devices`: exactly `Ống nghe Demo Workspace`.
- `/api/admin/packages`: `403`.
- `/api/admin/doctor-requests`: `403`.

## 2026-06-06 Account/Settings Function Smoke

After starting backend in Firebase production mode and web admin on `5174`, use the Firebase workspace-admin account to verify unlocked Account/Settings functions.

Backend/API expectations:

- `GET /api/me` returns `role = workspace_admin` and `currentWorkspaceId = org_workspace_demo_hospital`.
- `PATCH /api/me` saves `notificationPreferences` and avatar fields.
- `POST /api/me/2fa` with `{ "action": "enable", "method": "app" }` returns enabled demo 2FA and recovery codes; `{ "action": "disable" }` clears it.
- `POST /api/admin/storage-files?bucket=avatars&filename=avatar-smoke.png` with raw image body returns a file with `downloadUrl`/`previewUrl`; authenticated download returns `image/png`.
- `PATCH /api/settings` saves `branding.logoFileId/logoUrl` for workspace settings.
- `POST /api/settings/backup-check` returns `backup.status = ok`.
- `POST /api/settings/api-keys`, `POST /api/settings/api-keys/:id/rotate`, and `DELETE /api/settings/api-keys/:id` create, rotate, and revoke a workspace-scoped key.
- `POST /api/settings/ai/check-update` and `POST /api/settings/ai/update` return/update local-demo AI model metadata.
- Workspace `/api/settings` must not expose any `securityPolicy.apiKeys` with `scope = platform`.

Verification commands used on 2026-06-06:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run smoke:workspace-access
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
```

```powershell
rg -n 'window\.confirm|alert\(' -S "D:\Study\KLTN\smart-health-admin\thiết kế giao diện\src"
```

Expected `rg` result: no matches. The 2026-06-06 browser smoke screenshot for workspace Settings is:

```text
D:\Study\KLTN\docs\report-evidence\2026-06-05\screenshots\web-admin-settings-workspace-unlocked-20260606.png
```

## 2026-06-06 KLTN Product-Readiness Commands

Backend and web admin verification:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run smoke:workspace-access
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
```

Web product build for a real backend. This must use production auth and HTTPS non-local backend URLs:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
cmd.exe /c "set ""VITE_AUTH_MODE=production"" && set ""VITE_SMART_HEALTH_BASE_URL=https://api.smart-health.example.com"" && set ""VITE_SMART_HEALTH_API_BASE_URL=https://api.smart-health.example.com/api"" && npm.cmd run build:product"
```

Firebase Hosting surface builds for the real product:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build:firebase:admin
npm.cmd run build:firebase:portal
```

Expected guard check: product/Firebase builds must fail if the effective backend URL is local or non-HTTPS.

Android debug build for emulator/dev:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

Android release build for a real backend. This must use HTTPS and must not be localhost, `127.0.0.1`, `0.0.0.0`, or emulator `10.0.2.2`:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com
```

Expected guard check:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease
```

The no-URL release command should fail with `SMART_HEALTH_BASE_URL is required for release builds`.

Firmware compile:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run
```

Firmware OTA env compile:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-ota
```

Firmware flash and monitor after the ESP32-S3 board appears as a real COM port:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device list
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run --target upload --upload-port COM6
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device monitor --port COM6 --baud 115200
```

Firmware setup portal behavior:

- If WiFi config is missing or WiFi cannot connect, the board starts AP `SmartHealth-<suffix>`.
- On a phone or laptop, open WiFi settings and connect to that AP.
- The recovery AP is open/no password in this KLTN slice because it only accepts WiFi SSID/password; it does not expose backend host, device secret, owner, OTA, restart, or admin settings.
- Many phones show a captive portal automatically. If not, open a browser manually and type exactly `http://192.168.4.1` (use `http`, not `https`).
- Enter only WiFi SSID/password. Save restarts the board and stores WiFi config in ESP32 NVS namespace `smart-health`.
- Backend host, device id, device secret, firmware version, ownership, and OTA are managed through build/provisioning plus the main Web Admin/backend cloud flow.

Firmware cloud operation after the first wired flash:

- If the ESP is not configured or cannot join WiFi: connect to `SmartHealth-<suffix>` and open `http://192.168.4.1`.
- If the ESP joins WiFi and has Internet/backend access, do not use a local `.local` admin page for management. Open the main Web Admin Devices page.
- Web Admin receives status from backend heartbeat/events and can send restart/revoke/lock/status/OTA commands through backend cloud.
- Realtime listening uses ESP outbound WebSocket/WSS to backend and Web Admin/app WebSocket from backend; the ESP and web/app do not need to be on the same WiFi.

Cloud OTA from Web Admin:

1. Build firmware:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
```

2. Host/upload this file where the ESP can download it:

```text
D:\Study\KLTN\smart-health-embedded\MSM261S4030H0\.pio\build\esp32-s3-devkitm-1\firmware.bin
```

3. Compute SHA-256, then send firmware version, URL, and checksum from Web Admin Devices. The ESP downloads through HTTP/HTTPS, verifies SHA-256 when provided, writes OTA, emits OTA events, and reboots.

LAN ArduinoOTA/PlatformIO OTA is dev-only. It requires same LAN and is disabled unless `SMART_HEALTH_ENABLE_LAN_OTA=1` plus a local `SMART_HEALTH_OTA_PASSWORD` is set. Do not use this as the KLTN product OTA story.

Hardware status from the 2026-06-06 check:

```text
PlatformIO device list showed only COM3 and COM4 Bluetooth serial links. ESP32-S3/COM6 was not connected yet.
```

## 2026-06-08 Admin Account, Avatar, And Password Smoke

Web Admin admin-account management route:

```text
https://shcare-admin.web.app/admin-accounts
```

Local dev route:

```text
http://127.0.0.1:5174/admin-accounts
```

Expected behavior:

- Sign in as a platform/system admin with `platform.users.manage`.
- Sidebar shows `Tài khoản admin`.
- `/admin-accounts` lists platform and workspace admin accounts.
- Create, edit name/title/phone, lock/unlock, reset password, and delete use backend APIs under `/api/admin/admin-users`.
- Editing the current login account's name/title/phone is allowed. Self role/workspace change, self lock, and self delete are blocked.

Account Settings avatar/password behavior:

- Avatar upload uses `POST /api/me/avatar` with the image body.
- Avatar preview/download uses authenticated `GET /api/me/avatar`.
- Avatar removal uses `DELETE /api/me/avatar`.
- Backend CORS must allow `X-File-Name`; this is required by avatar upload from Firebase Hosting to Render.
- Production S3/Supabase Storage avatar upload uses `ContentLength` and stores profile `avatarStorage` metadata so `/api/me/avatar` can still serve the image after repository/Postgres reloads.
- Production password change uses Firebase Web Auth re-authentication plus `updatePassword`, then backend `POST /api/me/password` with `{ "firebaseClientUpdated": true }`.
- Demo/no-Firebase fallback still uses backend current-password validation.
- Forgot Password uses Firebase Web Auth `sendPasswordResetEmail`; real delivery requires Firebase Console > Authentication > Sign-in method > Email/Password enabled, and `shcare-admin.web.app` listed under authorized domains.
- If Forgot Password shows a domain/continue URL authorization message, open Firebase Console > Authentication > Settings > Authorized domains and add `shcare-admin.web.app`. This is Firebase configuration, not a backend session problem.
- Email test now prefers Brevo HTTPS API on Render Free with env `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, optional `BREVO_FROM_NAME`, and optional `BREVO_API_URL`. Gmail SMTP remains fallback only for paid hosts/local demos that allow SMTP; if used, `SMTP_FROM` should match `SMTP_USER` and `SMTP_PASS` must be the 16-character Gmail App Password.

Runtime mojibake/font source audit:

```powershell
rg -n "Ă|Ä|áº|á»|Æ|â€|ï¿½|�" "D:\Study\KLTN\smart-health-admin\thiết kế giao diện\src" D:\Study\KLTN\smart-health-embedded\web-monitor\server.js D:\Study\KLTN\smart-health-embedded\web-monitor\src
rg -n "\?\?y|Gần \?\?|Hoạt động gần \?\?" "D:\Study\KLTN\smart-health-admin\thiết kế giao diện\src"
```

Expected result after the 2026-06-08 fix: no mojibake-pattern matches in runtime source. Plain `??` matches from a broad search are usually valid JavaScript nullish-coalescing operators, not text errors.

When reading Vietnamese files from Windows PowerShell, use UTF-8 explicitly:

```powershell
Get-Content -Encoding UTF8 "D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md"
```

Verification commands:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
npm.cmd run build:firebase
```

## 2026-06-08 Platform Admin Notification Email Fanout

Backend now sends a branded HTML email for every backend-created Web Admin notification to active platform/system admin emails only.

Render backend env needed for real delivery:

```text
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<Brevo API key>
BREVO_FROM_EMAIL=<verified sender email>
BREVO_FROM_NAME=Smart Health
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
WEB_ADMIN_URL=https://shcare-admin.web.app
NOTIFICATION_EMAIL_ENABLED=true
```

`NOTIFICATION_EMAIL_ENABLED=false` is only an emergency switch if notification email needs to be disabled without removing Brevo env.

After Render redeploy, create a Web Admin notification as a platform admin:

```text
https://shcare-admin.web.app/notifications
```

Expected behavior:

- The notification appears in Web Admin.
- All active platform/system admin accounts with valid email addresses receive a branded Smart Health email.
- The email CTA opens `https://shcare-admin.web.app/notifications`.
- Workspace/hospital admin accounts do not receive these fanout emails yet; that recipient policy is intentionally future work.

Backend syntax check for this feature:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
```

## 2026-06-12 Android Core MVP Build And Smoke

Android debug default now targets the public Render API:

```text
https://smart-health-api-r5is.onrender.com
```

Use the local emulator backend only when `web-monitor` is actually running on the host:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleDebug -PSMART_HEALTH_BASE_URL=http://10.0.2.2:3000
```

Normal cloud-backed Android build checks:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug -PSMART_HEALTH_BASE_URL=https://smart-health-api-r5is.onrender.com
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://smart-health-api-r5is.onrender.com
```

Backend syntax check for the Android share-target endpoint:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
```

Emulator smoke path:

```powershell
adb devices
adb install -r D:\Study\KLTN\smart-health-android\app\build\outputs\apk\debug\app-debug.apk
adb shell pm clear com.example.smart_health_android
adb logcat -c
adb shell am start -n com.example.smart_health_android/.MainActivity
adb exec-out uiautomator dump /dev/tty
adb logcat -d -b crash
adb logcat -d -t 300 | Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime|ANR|com.example.smart_health_android"
```

Expected startup behavior:

- No Android notification permission dialog before login.
- If no Firebase session exists, app lands on email login after splash health preflight.
- Login/signup copy should not mention `demo`, `backend cloud`, or raw `doctorUserId`/`workspaceId`.
- Records sharing should use the searchable doctor/workspace picker after login.

## 2026-06-24 Web Portal UI Regression Pass

```powershell
cd D:\Study\KLTN\smart-health-web
bunx prettier --write src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx src/web-styles/signal-horizon.css
bunx eslint src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx
bun run build
```

Browser QA: verify `/` at the top and after a desktop scroll; hover `Sản phẩm` and `Giải pháp`, then move into a child link; check `/login` and `/register` at 1440x1000 and 500x900. If the console shows `http://127.0.0.1:3000/api/me` refused, start `smart-health-embedded\web-monitor`; this is local backend availability, not a portal visual regression.

## 2026-06-24 Public Web Visual Release And Firebase Hosting

Run the local UI checks:

```powershell
cd D:\Study\KLTN\smart-health-web
bunx prettier --write src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx src/web-styles/signal-horizon.css
bunx eslint src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx
bun run build
```

Production build and hosting deploy require `VITE_AUTH_MODE=production`, the production API URL, Firebase web config, and `VITE_PUBLIC_SITE_URL=https://shcare.web.app` in the process environment. Do not commit secrets to the web repo:

```powershell
cd D:\Study\KLTN\smart-health-web
bun run build:firebase
npx.cmd --yes firebase-tools@13.35.1 deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

Published site: `https://shcare.web.app`. Visual QA must confirm at the top of `/` that the header has no surface or blur, the doctor video is visible, and the hero has two video layers: `.shc-hero-video-main` sharp plus `.shc-hero-video-edge` masked/blurred only at the outer edges. After scroll, confirm the rounded low-opacity water-glass header. In a normal-motion browser, scroll public pages to confirm left/right blur-clear reveals; `prefers-reduced-motion` intentionally disables these animations.

## 2026-06-25 Public Web Fit/Motion Regression Pass

Use these checks after the 2026-06-25 fit/motion patch:

```powershell
cd D:\Study\KLTN\smart-health-web
bunx prettier --write src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx src/web-styles/signal-horizon.css
bunx eslint src/app/context/PublicMotionContext.ts src/app/layouts/PublicLayout.tsx src/app/pages/public/HomePage.tsx
bun run build
```

Production build:

```powershell
cd D:\Study\KLTN\smart-health-web
bun run build:firebase
```

Expected Firebase build assets from this patch: `dist-firebase/assets/index-BSdxiKdV.css`, `dist-firebase/assets/index-CfcxVhIe.js`, and `dist-firebase/assets/bacsi-CH0Km87A.mp4`.

Live QA checklist after deploy:

- Hero trust markers under the CTA are inline text/icon markers, not white square/rectangular boxes.
- Header at top is fully transparent with no glass surface; after scroll it is lower-opacity water glass with stronger blur.
- Desktop scroll shows visible left/right/up reveal movement on homepage and public pages. The site motion toggle defaults enabled and can disable the choreography.
- Mobile home, product, pricing, solution, login, and register pages have no horizontal overflow; hero preview and auth forms fit within the viewport.

## 2026-06-30 Public Web Mobile/Motion Release Commands

Current deployed `shcare.web.app` release after the mobile proof-card, scroll-reset, motion, contrast, and portal-status fix:

```text
Firebase Hosting site: shcare
Firebase version: projects/162993928259/sites/shcare/versions/cc264fa1be69d04a
Live release: projects/162993928259/sites/shcare/channels/live/releases/1782759036395000
CSS asset: /assets/index-DftUVpnd.css
JS asset: /assets/index-DNVNrv9k.js
Video asset: /assets/bacsi-CH0Km87A.mp4
```

Verification commands used:

```powershell
cd D:\Study\KLTN\smart-health-web
bunx prettier --write src/app/pages/public/HomePage.tsx src/app/layouts/PublicLayout.tsx src/web-styles/signal-horizon.css
bunx eslint src/app/pages/public/HomePage.tsx src/app/layouts/PublicLayout.tsx src/app/layouts/AuthLayout.tsx src/app/layouts/PortalLayout.tsx src/lib/smart-health-api.ts
bun run build
```

Backend verification:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd test
npm.cmd run smoke:workspace-access
npm.cmd run smoke:repositories
npm.cmd run check:production
```

Firebase build and deploy:

```powershell
cd D:\Study\KLTN\smart-health-web
$source = 'D:\Study\KLTN\smart-health-admin\thiết kế giao diện\.env.production'
Get-Content -LiteralPath $source -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
    $idx = $line.IndexOf('=')
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    if ($key.StartsWith('VITE_')) { [Environment]::SetEnvironmentVariable($key, $value, 'Process') }
  }
}
$env:VITE_AUTH_MODE = 'production'
$env:VITE_SMART_HEALTH_API_BASE_URL = 'https://smart-health-api-r5is.onrender.com/api'
$env:VITE_PUBLIC_SITE_URL = 'https://shcare.web.app'
bun run build:firebase

$env:GOOGLE_APPLICATION_CREDENTIALS = 'D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json'
$env:npm_config_cache = 'D:\Study\KLTN\.npm-cache'
$env:XDG_CONFIG_HOME = 'D:\Study\KLTN\.config'
New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME | Out-Null
npx.cmd firebase-tools@latest deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

Live smoke:

```powershell
$home = Invoke-WebRequest -UseBasicParsing 'https://shcare.web.app/' -Headers @{ 'Cache-Control'='no-cache' }
$home.StatusCode
$home.Headers['Cache-Control']
($home.Content | Select-String -Pattern 'index-[A-Za-z0-9_-]+\.css|index-[A-Za-z0-9_-]+\.js' -AllMatches).Matches.Value | Sort-Object -Unique

(Invoke-WebRequest -UseBasicParsing 'https://shcare.web.app/login' -Headers @{ 'Cache-Control'='no-cache' }).StatusCode
(Invoke-WebRequest -UseBasicParsing 'https://smart-health-api-r5is.onrender.com/api/health').StatusCode
```

Browser QA expectations for this release:

- Mobile 390px home proof cards: `document.documentElement.scrollWidth === document.documentElement.clientWidth`; each `.shc-proof-card` spans the phone width, not a skinny vertical column.
- Route scroll reset: from a scrolled public route, clicking another internal link returns `window.scrollY` to `0`.
- Motion: with OS reduced-motion/default, `data-shc-motion` can be `reduced`; setting `localStorage.setItem('shc-public-motion','enabled')` and reloading should make `.shc-proof-card` move from `pending` offset/opacity/blur to `visible` opacity `1`, transform `0`, blur `0`.
- Auth mobile dark: `/login` and `/register` keep card/input widths inside the 390px viewport and use readable input text/placeholder contrast.

## 2026-06-30 Public Web Build Recovery/Code-Split Release Commands

Current deployed `shcare.web.app` release after restoring the missing manifest/config, route lazy splitting, HydrateFallback cleanup, and portal-status smoke coverage:

```text
Firebase Hosting site: shcare
Firebase version: projects/162993928259/sites/shcare/versions/b4872b04beaabdec
Live release: projects/162993928259/sites/shcare/channels/live/releases/1782803246138000
CSS asset: /assets/index-BQJHr-Te.css
JS asset: /assets/index-e8iN3TOO.js
Largest JS chunk: react-core-m1p_GdN4.js (~283 kB)
```

Web verification:

```powershell
cd D:\Study\KLTN\smart-health-web
bunx eslint src/app/routes.tsx
bunx tsc --noEmit --pretty false
bun run build
```

Production Firebase build:

```powershell
cd D:\Study\KLTN\smart-health-web
$source = 'D:\Study\KLTN\smart-health-admin\thiết kế giao diện\.env.production'
Get-Content -LiteralPath $source -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
    $idx = $line.IndexOf('=')
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    if ($key.StartsWith('VITE_')) { [Environment]::SetEnvironmentVariable($key, $value, 'Process') }
  }
}
$env:VITE_AUTH_MODE = 'production'
$env:VITE_SMART_HEALTH_API_BASE_URL = 'https://smart-health-api-r5is.onrender.com/api'
$env:VITE_PUBLIC_SITE_URL = 'https://shcare.web.app'
bun run build:firebase
```

Firebase target restore/deploy if `.firebaserc` is missing:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json'
$env:npm_config_cache = 'D:\Study\KLTN\.npm-cache'
$env:XDG_CONFIG_HOME = 'D:\Study\KLTN\.config'
New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME | Out-Null
npx.cmd firebase-tools@latest target:apply hosting webapp shcare --project smart-health-stethoscope --non-interactive
npx.cmd firebase-tools@latest deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

Backend verification now includes portal-status smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd test
npm.cmd run smoke:workspace-access
npm.cmd run smoke:repositories
npm.cmd run check:production
npm.cmd run check:production:strict
```

`check:production:strict` is expected to exit nonzero in local/demo env until real production provider secrets are configured.

## 2026-07-01 Shcare Hero Seam / Production Strict / Auth E2E Commands

Web verification and deploy used for the hero seam release:

```powershell
cd D:\Study\KLTN\smart-health-web
bunx tsc --noEmit --pretty false
bun run build:firebase
bun run build

$env:GOOGLE_APPLICATION_CREDENTIALS = 'D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json'
$env:npm_config_cache = 'D:\Study\KLTN\.npm-cache'
$env:XDG_CONFIG_HOME = 'D:\Study\KLTN\.config'
npx.cmd firebase-tools@latest deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

Backend production strict and smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check:production:strict
npm.cmd run smoke:public-deployment
```

`check:production:strict` in a local PowerShell shell remains blocked unless the same secret envs from Render are loaded into that process. Do not infer from this local failure that Render/Firebase/Supabase must be created again; the project docs already record existing Render backend, Firebase Auth/Hosting, Supabase Postgres, and Supabase Storage S3-compatible setup. Authenticated E2E used Firebase Web SDK config from `firebase-tools apps:sdkconfig` and existing `.test-data` role accounts; do not print passwords, API keys, or ID tokens in logs.

## 2026-07-01 Backend Contract Fix Commands

Use this focused backend suite after changing routes used by Web Admin, Shcare Portal, or Android:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd test
npm.cmd run smoke:workspace-access
npm.cmd run smoke:repositories
npm.cmd run check:production
npm.cmd run check:production:strict
npm.cmd run smoke:public-deployment
```

For the 2026-07-01 route-contract fix, `smoke:workspace-access` specifically verifies `GET /api/v1/devices/:id/events` for own/cross-workspace devices and `DELETE /api/portal/notifications/:id`.

The same smoke is now also the focused Shcare Portal backend-contract suite. It covers public contact, portal status/overview/monitoring/reports/audit, patient CRUD, patient share/revoke, scan note update, device assign/command, staff create/list, settings/workspace patch, `/api/v1/me` notification preferences, share-target tenant scoping, notification read/read-all/delete, and cross-workspace denials.

2026-07-01 deploy evidence for this BE route-contract fix:

```text
commit: 409a3592 Fix portal backend route contract
tooling commit: 71a38f3e Add backend production smoke tooling
live backend: https://smart-health-api-r5is.onrender.com
public smoke: npm.cmd run smoke:public-deployment passed
auth smoke: npm.cmd run smoke:production-roles passed
route canary: doctor.viewer.smoke@smarthealth.test has workspace.devices.view, no workspace.devices.manage, and GET /api/v1/devices/lite-steth-a92/events returned HTTP 200
```

The tooling commit changed backend `npm start` to `node scripts/start.js`. On hosts with `DATABASE_URL`, `scripts/start.js` runs `scripts/migrate.js` first, then starts `server.js`; without `DATABASE_URL`, it starts normally. Migration `006_secure_public_tables.sql` enables RLS and revokes direct Supabase `anon`/`authenticated` table access so web/mobile clients continue to use the Render backend API.

In a local demo env, `check:production:strict` is still expected to fail with `BLOCKED`; pass requires real provider envs on the backend host.

## 2026-07-01 Shcare Portal Auth API Base Hotfix

Root cause for the login/register banner "Không thể kết nối backend Smart Health": the deployed `shcare.web.app` bundle had been built without `VITE_SMART_HEALTH_API_BASE_URL`, so `smart-health-web/src/lib/smart-health-api.ts` used its fallback `http://localhost:3000/api`. Browsers then tried to call the visitor's own machine instead of Render.

Use this exact pattern before deploying `shcare.web.app`:

```powershell
cd D:\Study\KLTN\smart-health-web
$adminEnv = 'D:\Study\KLTN\smart-health-admin\thiết kế giao diện\.env.production'
Get-Content -LiteralPath $adminEnv -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*(VITE_FIREBASE_[A-Z0-9_]+)=(.*)\s*$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim('"').Trim("'"), 'Process')
  }
}
$env:VITE_AUTH_MODE = 'production'
$env:VITE_SMART_HEALTH_API_BASE_URL = 'https://smart-health-api-r5is.onrender.com/api'
$env:VITE_PUBLIC_SITE_URL = 'https://shcare.web.app'
bunx tsc --noEmit --pretty false
bun run build:firebase
npx firebase-tools deploy --only hosting:webapp --project smart-health-stethoscope
```

Verification after deploy:

```powershell
npm.cmd run smoke:public-deployment
```

Also fetch the live main asset and confirm it has `localhostCount=0` and `renderApiCount=1` for `smart-health-api-r5is.onrender.com/api`. The 2026-07-01 fixed release was Firebase Hosting version `projects/162993928259/sites/shcare/versions/e59c69dd22c36505`, live release `projects/162993928259/sites/shcare/channels/live/releases/1782921251706000`; the current live backend is the 2026-07-09 Render migration URL.

## 2026-07-07 Codex Telegram Bridge Account Sync Commands

Local verification for account quota sync/default-account and worker concurrency:

```powershell
cd D:\Study\KLTN\codex-telegram-bridge
npm.cmd run windows:check
npm.cmd run typecheck
npx.cmd vitest run tests/db.test.ts tests/app.test.ts tests/workerRuntime.test.ts
npx.cmd vitest run tests/codexRunner.test.ts
npm.cmd test
npm.cmd run build
```

For the completion-notification slice, `tests/app.test.ts` is the focused practical smoke. It drives the real Fastify route/SQLite event/Telegram-client path with multiple jobs and sessions in one batch, then replays the same events to confirm no duplicate final messages are sent.

Real account/quota smoke should not restart the live bridge while a Telegram-launched Codex job is running. Use a copied DB, a temporary port, and Telegram polling disabled:

```powershell
cd D:\Study\KLTN\codex-telegram-bridge
$env:PORT="8798"
$env:DATABASE_PATH="./data/smoke-account-switch.sqlite"
$env:BRIDGE_SERVER_URL="http://127.0.0.1:8798"
$env:TELEGRAM_POLLING_ENABLED="0"
Start-Process -FilePath node -ArgumentList "dist/server/index.js" -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput "data/smoke-server.out.log" -RedirectStandardError "data/smoke-server.err.log"
Start-Process -FilePath node -ArgumentList "dist/worker/index.js" -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput "data/smoke-worker.out.log" -RedirectStandardError "data/smoke-worker.err.log"
```

The 2026-07-07 smoke used a copied live DB on port `8798`. It verified switching between accounts, fallback away from exhausted `.codex`, correct active/default display, and default persistence after server restart. It did not prove real quota refresh because tested Codex profiles returned out-of-credit/usage-limit errors or no `token_count` event, so keep the bridge account/quota item IN PROGRESS until a real profile produces a quota snapshot after switching.

Worker concurrency is configured in `.env`:

```powershell
WORKER_CONCURRENCY=2
```

Valid range is `1-4`; default is `2`. The DB still blocks two resume jobs for the same `target_session_id`, so parallel execution is for separate sessions/new tasks.

After changing `.env` or pulling this bridge update, restart the local bridge:

```powershell
cd D:\Study\KLTN\codex-telegram-bridge
npm.cmd run windows:restart
```

Do this only after active bridge-launched jobs finish; otherwise the running task can be interrupted.
