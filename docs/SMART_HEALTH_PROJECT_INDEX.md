# Smart Health - Project Index

Last updated: 2026-07-07

This is the fastest navigation file for `D:\Study\KLTN`. Read it before opening broad folders or scanning the whole workspace.

## Start Here

Read in this order:

1. `docs/SMART_HEALTH_CONTEXT_NEW_CHAT.md` - current state, product direction, latest verified work.
2. `docs/SMART_HEALTH_PROMPT_REQUIREMENTS_HANDOFF.md` - broad prompt ledger, product invariants, closed slices, blockers, and next non-repeated slice.
3. `docs/SMART_HEALTH_IMPLEMENTATION_STATUS.md` - what is real, partial, scaffold, or still missing.
4. `docs/SMART_HEALTH_PRODUCTION_BACKLOG.md` - next production slices in priority order.
5. `docs/SMART_HEALTH_COMMANDS_GUIDE.md` - commands, envs, smoke tests, deploy notes.
6. `docs/SMART_HEALTH_NEXT_DAY_SETUP_GUIDE.md` - Vietnamese operational setup checklist.

For product decisions, also read:

- `docs/SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`
- `docs/SMART_HEALTH_THIRD_PARTY_SETUP.md`
- `docs/SMART_HEALTH_AGENT_SKILLS_GUIDE.md`

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
| Backend API | `https://smart-health-api-xj0a.onrender.com/api` |
| Firebase project | `smart-health-stethoscope` |

## Current Latest State

- Firebase Auth is the identity provider across Android, Web Admin, and Shcare Portal.
- Render, Firebase Hosting/Auth, Supabase Postgres, and Supabase S3-compatible storage were already set up earlier; do not ask to recreate them from scratch.
- `MSM261S4030H0` is the only active firmware target. Do not route new work to INMP441.
- Shcare Web registration email verification now uses a backend-generated Firebase verification link delivered through the outbound email provider stack.
- Backend notification creation now has a Firebase Cloud Messaging delivery path for direct user notifications, records push delivery status separately from platform-admin email fanout, persists per-attempt `pushAttempts` history without raw FCM tokens, and retries retryable provider failures with bounded env controls.
- As of 2026-07-07, backend/source commit `88877ad5` (`Ship Smart Health tenant hardening and live smokes`) and docs commit `b12a16f6` (`Document Smart Health live deploy verification`) are pushed to `origin/main`. Render auto-deploy was verified through live health and public/role/portal/admin smokes.
- As of 2026-07-07, `shcare.web.app` is deployed at Firebase Hosting version `projects/162993928259/sites/shcare/versions/fab6a2ad97c63420`, release `projects/162993928259/sites/shcare/channels/live/releases/1783411275583000`. The latest confirmed `shcare-admin.web.app` deploy is version `projects/162993928259/sites/shcare-admin/versions/ce26044bb3730062`, release `projects/162993928259/sites/shcare-admin/channels/live/releases/1783411298455000`.
- Shcare Portal unauthenticated deep links such as `/portal/patients` now redirect to `/login` without the previous `No QueryClient set` crash or React maximum-update-depth console failure.
- Shcare Portal login no longer exposes raw Firebase `auth/invalid-credential` errors. Invalid credentials render safe Vietnamese guidance and platform-admin accounts are directed to `shcare-admin.web.app`.
- Live authenticated portal API smoke is available through `npm.cmd run smoke:portal-production` after `npm.cmd run smoke:production-roles`; it verifies platform portal rejection plus workspace-admin and doctor read paths against Render.
- Authenticated Chrome smoke on the deployed `shcare.web.app` confirmed workspace-admin and doctor read routes without runtime console warnings; portal form controls now have stable `id`/`name` attributes.
- Live `bun run smoke:portal-browser` and `bun run smoke:portal-mutation` pass against `https://shcare.web.app`. Mutation coverage creates/updates/deletes a controlled patient, provisions/claims/assigns/restores/cleans a device, creates/reads/deletes a notification, saves/restores workspace settings and notification preferences, exports CSV, submits/cleans a support ticket, checks expected 404 states, logs out, and logs back in. A custom no-query-leak smoke also confirms pre-hydration/native form submit does not expose credentials in URL query strings.
- Live `npm.cmd run smoke:admin-mutation` passes from `smart-health-admin\thiết kế giao diện` after refreshing production role credentials. It covers controlled Web Admin workspace/package/patient/device/notification/storage/settings mutations against live Render/Admin and cleans up every created/restored resource.
- Web Admin lint is warning-free after the Fast Refresh mixed-export cleanup; PDF export font bloat was moved out of TypeScript bundles into `public/fonts/roboto-regular.ttf`.
- Local strict production readiness can still report `BLOCKED` when Render/Supabase/Firebase/provider secrets are not loaded into the current PowerShell process.

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
npm.cmd run check
npm.cmd run smoke:workspace-access
npm.cmd run smoke:repositories
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
bunx tsc --noEmit --pretty false
bun run build:firebase
bun run smoke:portal-browser
bun run smoke:portal-mutation
```

Web Admin:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:production-roles

cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run lint
npm.cmd run build:firebase:admin
npm.cmd run smoke:admin-mutation
```

Android:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

Firmware:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

## Remaining Practical Work

- Verify repository-backed tenant isolation with production-like Supabase/Postgres data.
- Run browser performance/Lighthouse regression on the current split Shcare Web bundle.
- Confirm real inbox receipt/click-through for production email verification.
- Run real Android FCM delivery with a real device token against Render.
- Flash the real MSM261 ESP32-S3 board and capture serial evidence for WiFi, heartbeat, audio, cloud command, and OTA.
