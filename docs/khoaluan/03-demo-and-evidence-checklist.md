# Smart Health KLTN Demo And Evidence Checklist

Last updated: 2026-07-10

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

Backend contract smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:klt-contract
```

Backend local checks:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run smoke:workspace-access
npm.cmd test
```

Firmware source build:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

Firmware physical device probe:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe device list
```

Android source/build checks:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

Shcare Portal checks:

```powershell
cd D:\Study\KLTN\smart-health-web
bunx tsc --noEmit --pretty false
bun run lint
bun run build
bun run smoke:portal-browser
bun run smoke:portal-mutation
```

Web Admin checks:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run lint
npm.cmd run build:firebase:admin
npm.cmd run smoke:admin-mutation
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
