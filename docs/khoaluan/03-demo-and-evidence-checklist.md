# Smart Health KLTN Demo And Evidence Checklist

Last updated: 2026-08-22

Use this checklist to produce report-ready evidence without overstating what was actually verified.

## Demo Narrative

The expected KLTN demo flow is:

1. User signs in through Android or web.
2. User selects or creates the correct patient/family/workspace profile.
3. ESP32-S3 + MSM261S4030H0 captures audio and sends PCM16 to backend.
4. Backend reports live status/metrics, streams audio to Android/web listeners, and records an active scan.
5. User stops the scan.
6. Backend saves WAV/audio metadata and AI-quality result.
7. Android/web/admin show the saved scan in history/records/AI measurements.
8. The report records which parts were physical, which were source/build smoke, and which were simulated.

## Required Evidence Set

| Evidence | Required proof | Acceptable source |
| --- | --- | --- |
| Firmware build | PlatformIO build success for active `MSM261S4030H0` target | Terminal log saved under `docs/report-evidence/<date>/` |
| Physical board detection | ESP32-S3 serial port appears | `platformio device list` output |
| Serial audio metrics | Real serial monitor lines for I2S ready, peak/RMS, UDP/WSS counters | Serial monitor log from connected board |
| Backend health | `/api/health` or `/api/v1/health` returns JSON 200 | Backend smoke log |
| WebSocket listener | `/app` upgrade accepted and emits status/metrics | Runtime smoke or browser/Android log |
| Audio ingest | Backend accepts PCM payload and exposes live metrics | Physical run preferred; simulated UDP must be labeled |
| Scan persistence | Recording stops with WAV/audio file and completed scan | Backend API smoke, saved WAV metadata, waveform artifact |
| Android build | `compileDebugKotlin`, `assembleDebug`, unit tests when available | Gradle logs |
| Android runtime | Login/profile/live-monitor/history screenshots or emulator/device capture | Real device/emulator evidence only |
| Web/Admin build | Web/admin typecheck/lint/build and route screenshots | Build logs and Playwright screenshots |
| Role/security | Unauthorized role/surface access denied | Backend/portal/admin smoke logs |
| Limitations | Hardware/provider/clinical gaps stated clearly | Report text and gap log |

## Focused Commands

Run every command below from the canonical repository root. Do not use old
`D:\Study\...` paths and do not use `bunx tsc`.

Interactive local demo (isolated JSON data, local demo auth only):

```powershell
npm.cmd --prefix smart-health-embedded/web-monitor run demo:stack
```

When all three readiness checks pass, the launcher prints:

- Public Web / Portal: `http://127.0.0.1:8765`
- Platform Admin: `http://127.0.0.1:8766/login`
- Backend health: `http://127.0.0.1:3765/api/v1/health`
- Patient: `patient@example.com` / `12345678`
- Doctor: `doctor@example.com` / `12345678`
- Admin: `admin.demo@shcare.local` / `Shcare-Demo-2026!`

Press `Ctrl+C` after the demo. The launcher stops its child processes and
deletes its temporary data. If one of the demo ports is intentionally changed,
set `SHCARE_DEMO_BACKEND_PORT`, `SHCARE_DEMO_AUDIO_PORT`,
`SHCARE_DEMO_WEB_PORT` or `SHCARE_DEMO_ADMIN_PORT` only for that terminal
session. This launcher never enables demo authentication in a production
build or live deployment.

Backend contract smoke:

```powershell
npm.cmd --prefix smart-health-embedded/web-monitor run smoke:klt-contract
```

Backend local checks:

```powershell
npm.cmd --prefix smart-health-embedded/web-monitor run check
npm.cmd --prefix smart-health-embedded/web-monitor run smoke:workspace-access
npm.cmd --prefix smart-health-embedded/web-monitor test
```

Firmware source build:

```powershell
& C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run --project-dir smart-health-embedded/MSM261S4030H0
```

Firmware physical device probe:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe device list
```

Android source/build checks:

```powershell
Push-Location smart-health-android
.\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest :app:assembleDebug --console=plain
Pop-Location
```

Shcare Portal checks:

```powershell
& .\smart-health-web\node_modules\.bin\tsc.cmd --noEmit --pretty false -p smart-health-web/tsconfig.json
npm.cmd --prefix smart-health-web run lint
npm.cmd --prefix smart-health-web run build
npm.cmd --prefix smart-health-web run smoke:portal-browser
npm.cmd --prefix smart-health-web run smoke:portal-mutation
```

Web Admin checks:

```powershell
npm.cmd --prefix "smart-health-admin/thiết kế giao diện" run test:contracts
npm.cmd --prefix "smart-health-admin/thiết kế giao diện" run lint
npm.cmd --prefix "smart-health-admin/thiết kế giao diện" run build
npm.cmd --prefix "smart-health-admin/thiết kế giao diện" run smoke:admin-mutation
```

## Evidence Naming

Use names that make the proof auditable:

- `firmware-platformio-run-YYYYMMDD.log`
- `firmware-device-list-YYYYMMDD.log`
- `firmware-serial-audio-YYYYMMDD.log`
- `backend-klt-contract-smoke-YYYYMMDD.log`
- `backend-runtime-audio-smoke-YYYYMMDD.log`
- `android-compile-debug-kotlin-YYYYMMDD.log`
- `android-live-monitor-YYYYMMDD.png`
- `portal-browser-smoke-YYYYMMDD.log`
- `admin-mutation-smoke-YYYYMMDD.log`
- `audio-scan-<scanId>.wav`
- `audio-waveform-<scanId>.json/png`

## Blocker Handling

If hardware/provider evidence cannot be captured:

- Record the exact command and result.
- Mark the item `blocked by missing device/env/provider`, not `done`.
- Keep source/build/static contract proof separate from physical proof.
- Do not insert invented screenshots, serial logs, or waveform captures into the report.
