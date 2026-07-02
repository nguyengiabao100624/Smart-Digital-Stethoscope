# Contributing to Smart Digital Stethoscope

Thank you for contributing to Smart Digital Stethoscope / Smart Health. This repository spans firmware, backend, Android, web, deployment, and thesis documentation, so contributions need to stay scoped, verified, and careful with secrets and medical data.

## Project Scope

Smart Health is a connected digital stethoscope platform:

- ESP32-S3 MSM261 firmware in `smart-health-embedded/MSM261S4030H0`
- Node.js backend in `smart-health-embedded/web-monitor`
- Android app in `smart-health-android`
- Shcare Workspace Portal in `smart-health-web`
- Platform Admin Console in `smart-health-admin/thiết kế giao diện`
- Project status and runbooks in `docs`

This is an engineering prototype, not a certified medical device. Do not present demo AI output as clinical diagnosis.

## Contribution Workflow

1. Fork or branch from `main`.
2. Create a focused branch, for example `fix/email-verification-resend` or `docs/readme-refresh`.
3. Keep changes limited to the area you are actually fixing.
4. Do not commit generated build output, local caches, secrets, service accounts, or patient data.
5. Run the relevant verification commands.
6. Open a pull request with a clear summary, test evidence, screenshots for UI changes, and known limitations.

## Branch And Commit Guidelines

- Use small, reviewable commits.
- Write commit messages in imperative form, for example `Fix portal email verification resend`.
- Separate source changes from generated files.
- If a change updates behavior, also update the relevant docs or runbooks.
- Do not mix unrelated cleanup with a feature or bug fix.

## Local Setup

Use Windows PowerShell unless a command says otherwise.

Backend:

```powershell
cd smart-health-embedded\web-monitor
npm ci
npm run check
npm test
npm run smoke:workspace-access
```

Shcare Web Portal:

```powershell
cd smart-health-web
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit --pretty false
bun run build:firebase
```

Platform Admin:

```powershell
cd "smart-health-admin\thiết kế giao diện"
npm ci
npm run lint
npm run build:firebase:admin
```

Android:

```powershell
cd smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

Firmware:

```powershell
cd smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-ota
```

## Verification Expectations

Run checks that match your change:

| Change area | Minimum expected checks |
| --- | --- |
| Backend route, auth, repository, email, storage | `npm run check`, `npm test`, relevant smoke script |
| Portal UI or auth flow | `bun run lint`, `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, browser smoke when UI changes |
| Platform Admin UI | `npm run lint`, `npm run build:firebase:admin`, browser smoke when UI changes |
| Android | `.\gradlew.bat :app:compileDebugKotlin`; emulator smoke for navigation/runtime fixes |
| Firmware | PlatformIO build for normal and OTA environments; hardware smoke if touching provisioning/audio/OTA |
| CI/deploy workflow | Local syntax/diff checks plus observed GitHub Actions run after push |
| Docs only | Link/path review and UTF-8 check for Vietnamese text |

If a check cannot be run, state why in the pull request.

## Coding Standards

Backend:

- Keep route, service, repository, auth, and storage boundaries clear.
- Verify Firebase ID tokens server-side.
- Do not trust role, workspace, organization, or capability values supplied by a client.
- Preserve old routes when current Android/web clients still use them.
- Return explicit error shapes and avoid pretending email/storage/push delivery succeeded when provider config is missing.

Web:

- Preserve Smart Health surfaces: `shcare.web.app` for doctor/clinic portal and `shcare-admin.web.app` for platform admin.
- Keep auth guards, role/surface redirects, and backend API base URLs explicit.
- Avoid demo data flashing before real API state.
- Ensure UI changes work in desktop and mobile widths.

Android:

- Keep heavy business logic out of Compose screens.
- Use API/service/ViewModel layers for backend state.
- Keep doctor/pending/needs-info/rejected onboarding states reachable.
- Preserve UTF-8 Vietnamese strings.

Firmware:

- Do not hardcode real Wi-Fi, backend, device, or OTA secrets.
- Keep MSM261 ESP32-S3 as the current production firmware target.
- Preserve cloud-first telemetry/audio behavior and local UDP fallback where required for development.

## Secrets, Privacy, And Medical Data

Never commit:

- Firebase service account JSON
- Real `google-services.json`
- `.env.production` or provider secrets
- API keys, database URLs, S3 credentials, PHI encryption keys
- Wi-Fi passwords, device secrets, OTA passwords
- Real patient records, clinical audio, screenshots containing PHI, or exported reports

Use fake/demo data in tests and documentation. If you accidentally commit a secret, rotate it immediately and notify maintainers privately.

## Pull Request Checklist

Before requesting review:

- [ ] The PR has a clear problem statement and summary.
- [ ] The changed files are scoped to the task.
- [ ] Relevant tests/builds/smokes were run and listed.
- [ ] UI changes include screenshots or browser smoke notes.
- [ ] Firebase/Render/Supabase/S3/provider secrets are not committed.
- [ ] Generated output and local caches are not committed.
- [ ] Docs/runbooks are updated when behavior, commands, env vars, or deployment flow changed.
- [ ] Remaining limitations are stated honestly.

## Reporting Bugs

Open a GitHub issue for normal bugs. Include:

- Environment and surface: backend, Android, firmware, Shcare Portal, Platform Admin, or CI
- Exact steps to reproduce
- Expected behavior and actual behavior
- Relevant logs, screenshots, or request IDs
- Whether the issue happens locally, in CI, or on the live deployment

For security issues, do not open a public issue. Follow [SECURITY.md](SECURITY.md).
