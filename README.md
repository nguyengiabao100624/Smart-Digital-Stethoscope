# Smart Digital Stethoscope

[![Smart Health CI](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/smart-health-ci.yml/badge.svg)](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/smart-health-ci.yml)
[![Deploy Shcare Web Portal](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/deploy-shcare-web.yml/badge.svg)](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/deploy-shcare-web.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [Tiếng Việt](README.vi.md)

Smart Digital Stethoscope, also called Smart Health, is a graduation-thesis medical IoT platform for connected digital auscultation. The project combines ESP32-S3 firmware, a Firebase-authenticated backend, Android mobile workflows, a platform admin console, and the Shcare doctor/clinic web portal.

This repository is an engineering prototype and research product. It is not a certified medical device. AI and signal-processing output must be treated as decision-support information only and must not replace clinician judgment, regulated diagnostic workflow, or emergency care.

## Live Surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Shcare Workspace Portal | <https://shcare.web.app> | Doctor, clinic, and facility workspace portal |
| Platform Admin Console | <https://shcare-admin.web.app> | Platform/system administration |
| Backend API | <https://smart-health-api-xj0a.onrender.com/api> | Render-hosted Smart Health API |
| Firebase project | `smart-health-stethoscope` | Firebase Auth and Hosting targets |

## Current Reality

| Area | Status |
| --- | --- |
| Firebase Auth | Real integration for Android, Web Admin, and Shcare Portal. Backend verifies Firebase ID tokens and derives roles from backend state/custom claims. |
| Shcare Web Portal | Live on Firebase Hosting. Public/auth pages and doctor/clinic portal routing are implemented; full authenticated browser E2E for every mutation flow is still pending. |
| Platform Admin | Live on Firebase Hosting as a platform-admin-only surface. Doctor/clinic users are redirected to Shcare Portal. |
| Backend API | Node.js backend runs locally and on Render, with JSON demo mode plus PostgreSQL/repository direction. Not every runtime path has full repository parity yet. |
| Doctor registration/email verification | Backend-generated Firebase email-verification links are sent through the outbound email provider stack instead of trusting client-side request acceptance. |
| Android app | Kotlin/Jetpack Compose app compiles and uses Firebase-backed role/session flows. Some workspace/family-management polish remains. |
| Firmware | Current production target is `smart-health-embedded/MSM261S4030H0` on ESP32-S3. INMP441 is retired from the current product scope. |
| Audio/device pipeline | Cloud-first control/audio paths exist with WSS/HTTP direction and UDP fallback for development. Physical board E2E, MQTT/cert hardening, buffering, and signed OTA still need final validation. |
| AI pipeline | Demo/scaffold. Real clinical model validation and production inference pipeline are not complete. |
| CI/CD | GitHub Actions checks backend, Web Admin, Shcare Web build, Android compile, and ESP32-S3 firmware builds. Firebase Hosting deploy jobs require repository secrets. |

## Architecture

```text
ESP32-S3 MSM261 firmware
  -> device telemetry, command events, realtime/durable audio paths
  -> Smart Health backend on Render
  -> Firebase Auth, PostgreSQL direction, S3-compatible object storage direction
  -> Android app, Shcare Portal, Platform Admin
  -> Firebase Hosting surfaces
```

The intended production split is:

- Control plane: commands, telemetry, heartbeat, device health, and OTA events.
- Audio plane: WSS for realtime preview and HTTPS/object-storage upload for durable scan files.
- Identity plane: Firebase Auth, with backend-side role, workspace, and capability enforcement.
- Data plane: PostgreSQL and S3-compatible storage for production; JSON mode remains a demo/development fallback.

## Repository Structure

```text
.github/workflows/                  GitHub Actions CI and deploy workflows
docs/                               Project status, runbooks, diagrams, thesis/report material
smart-health-android/               Android app, Kotlin, Jetpack Compose
smart-health-embedded/web-monitor/  Node.js backend, smoke tests, demo monitor, production scripts
smart-health-embedded/MSM261S4030H0/ Current ESP32-S3 firmware target
smart-health-web/                   Shcare public site and doctor/clinic workspace portal
smart-health-admin/thiết kế giao diện/ Platform admin web app and shared Firebase surface tooling
```

Generated folders such as `dist/`, `dist-firebase/`, `.firebase/`, `.vite/`, `.tanstack/`, `.lovable/`, PlatformIO build output, and local secret files must stay out of Git.

## Prerequisites

- Node.js 22+ and npm
- Bun for `smart-health-web`
- JDK 17 and Android Studio for Android builds
- PlatformIO for ESP32-S3 firmware builds
- Firebase CLI for manual Firebase Hosting deploys
- Firebase project access and service account credentials for production/admin tasks
- Render/Supabase/S3-compatible storage credentials for strict production checks

Do not commit secrets, Firebase service account JSON, `google-services.json`, `.env.production`, device secrets, Wi-Fi passwords, PHI encryption keys, or patient data.

## Backend Setup

```powershell
cd smart-health-embedded\web-monitor
npm ci
npm run check
npm test
npm run smoke:workspace-access
npm start
```

Default local ports:

- HTTP/API/WebSocket backend: `http://localhost:3000`
- UDP audio fallback: `3001`

Useful backend checks:

```powershell
npm run smoke:repositories
npm run smoke:api-production
npm run smoke:production-roles
npm run smoke:public-deployment
npm run smoke:firebase-email
npm run check:production
```

`npm run check:production:strict` is expected to report blocked in a local shell when real Render/Supabase/S3/PHI/email provider env vars are not loaded.

## Shcare Web Portal

```powershell
cd smart-health-web
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit --pretty false
bun run build:firebase
bun run dev
```

Production Firebase build requires frontend env vars such as:

```text
VITE_AUTH_MODE=production
VITE_SMART_HEALTH_API_BASE_URL=https://smart-health-api-xj0a.onrender.com/api
VITE_PUBLIC_SITE_URL=https://shcare.web.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=smart-health-stethoscope.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=smart-health-stethoscope
VITE_FIREBASE_STORAGE_BUCKET=smart-health-stethoscope.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Manual deploy:

```powershell
cd smart-health-web
npx firebase-tools@latest deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

## Platform Admin Web

```powershell
cd "smart-health-admin\thiết kế giao diện"
npm ci
npm run lint
npm run build:firebase:admin
npm run dev
```

Manual deploy:

```powershell
cd "smart-health-admin\thiết kế giao diện"
npx firebase-tools@latest deploy --only hosting:admin --project smart-health-stethoscope --non-interactive
```

## Android App

```powershell
cd smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

The real `app/google-services.json` is intentionally ignored. CI uses `app/google-services.ci.json` only as a compile-time placeholder when the real file is absent.

## ESP32-S3 Firmware

```powershell
cd smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-ota
```

Keep Wi-Fi credentials, backend host, device ID, device secret, and OTA password outside source code. Use local build flags or provisioning flow for real devices.

## GitHub Actions

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `Smart Health CI` | push, pull request, manual | Backend check, workspace smoke, production readiness report, Web Admin build, Android compile, ESP32-S3 firmware builds |
| `Deploy Shcare Web Portal` | push for build-only, manual for deploy | Pushes run Shcare Web install/lint/build with CI-safe placeholders. Manual dispatch deploys `shcare.web.app`. |
| `Deploy Web Admin` | manual | Builds and deploys `shcare-admin.web.app`. |

Deploy workflows require these GitHub repository secrets:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
VITE_FIREBASE_API_KEY
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID   # optional for runtime if Analytics is unused
```

## Security And Privacy

- See [SECURITY.md](SECURITY.md) for vulnerability reporting.
- Do not open public issues containing tokens, service accounts, PHI, patient data, or exploitable details.
- Backend must verify Firebase ID tokens and must not trust role/workspace values sent by clients.
- All admin, device, storage, export, and account actions should preserve tenant isolation and auditability.
- This repository should contain only sample/demo data. Real patient data belongs in approved production systems with encryption, retention, access control, and legal review.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Expected baseline before submitting:

```powershell
cd smart-health-embedded\web-monitor
npm run check
npm test
npm run smoke:workspace-access

cd ..\..\smart-health-web
bun run lint
bunx tsc --noEmit --pretty false
bun run build:firebase

cd ..\smart-health-android
.\gradlew.bat :app:compileDebugKotlin

cd ..\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
```

Run the subset relevant to your change if you are working on a narrow area, and explain any skipped checks in the pull request.

## License

This project is released under the [MIT License](LICENSE). A Vietnamese reference translation is available at [LICENSE.vi.md](LICENSE.vi.md); the English `LICENSE` file is the canonical license text.

Copyright (c) 2026 Nguyen Gia Bao and Nguyen Quang Danh.
