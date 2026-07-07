# Smart Health - KLTN Report Completion Plan

Last updated: 2026-06-05

Source reviewed:

- `D:\Study\KLTN\docs\PL2 (3)-IEEE references.docx`
- `D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_REMOTE_FIRST_PRODUCT_DIRECTION.md`
- `D:\Study\KLTN\smart-health-embedded\MSM261S4030H0\platformio.ini`

Latest evidence folder:

- `D:\Study\KLTN\docs\report-evidence\2026-06-05`

Report-ready Word copy:

- `D:\Study\KLTN\docs\PL2 (3)-IEEE references.report-ready-20260605.docx`
- `D:\Study\KLTN\docs\PL2 (3)-IEEE references.final-evidence-20260605.docx`

## Current PL2 Status

`PL2 (3)-IEEE references.docx` is a usable KLTN draft frame. It already has:

- Cover/approval pages, table of contents, list of figures, list of tables, abbreviations.
- Opening section, Chapter 1 overview, Chapter 2 theory, Chapter 3 analysis/design, Chapter 4 experiment/evaluation, conclusion, references, and appendices.
- Three system figures:
  - Overall architecture.
  - Audio processing flow.
  - Connection/interface diagram.
- Requirement, deliverable, schedule, test-scenario, and evaluation tables.
- 15 IEEE-style references covering digital health, smart/electronic stethoscopes, PhysioNet heart sounds, MSM261S4030H0, ESP32-S3, I2S, WebSocket, REST, MQTT, NIST identity, and TinyML.

Main issue: many sections are still outline-level. The report can defend the project direction, but it still needs implementation evidence, actual results, and tighter alignment with the current Smart Health codebase before more feature development.

## Report Gate Before More Development

Finish these report parts first, then continue production-direction development.

### 1. Positioning And Scope

- State the product thesis clearly: Smart Health is a remote-first connected digital stethoscope platform, not a simple in-room replacement for a mechanical stethoscope.
- Define KLTN scope as a working end-to-end prototype:
  - ESP32-S3 + MEMS/I2S microphone.
  - Realtime audio path.
  - Backend scan/session API.
  - Android app.
  - Web admin/workspace portal direction.
  - Basic AI/TinyML and chatbot support.
- Separate three levels:
  - Implemented in KLTN demo.
  - Partially implemented/scaffolded.
  - Future production/clinical work.

### 2. Literature Review And Related Work

- Expand Chapter 1 related work into a comparison table using the current references:
  - Real-Time Smart-Digital Stethoscope System for Heart Diseases Monitoring.
  - Prototype of Self-Service Electronic Stethoscope.
  - OMES open-source multi-sensor stethoscope.
  - PhysioNet/CinC 2016 heart sound challenge.
- Compare each work by:
  - Hardware approach.
  - Realtime capability.
  - Remote monitoring support.
  - Storage/history support.
  - AI/classification support.
  - What Smart Health adds or simplifies.
- Keep citations in IEEE numeric style and make sure every cited claim maps to an item in `TÀI LIỆU THAM KHẢO`.

### 3. Requirements Tables

Update the current requirement tables so they match the actual project state:

- Functional requirements should include:
  - Firebase login/email verification.
  - Doctor registration and admin approval.
  - Family/dependent patient profiles.
  - Scan creation, realtime listen, scan history.
  - Web admin for doctors, clinics/workspaces, patients, devices, notifications, storage, reports.
  - Basic role/capability gating.
  - TinyML/chatbot as support, not diagnosis.
- Non-functional requirements should explicitly say:
  - UDP audio path is demo/local.
  - Production audio requires authenticated WSS/HTTPS chunk upload.
  - JSON data backend is demo/fallback.
  - PostgreSQL/object storage/audit hardening are future production work.
  - No medical certification or clinical validation is claimed.

### 4. System Design

Chapter 3 needs more detail under the existing headings:

- Hardware/firmware:
  - ESP32-S3 DevKitM-1 target from `platformio.ini`.
  - MSM261S4030H0 MEMS/I2S microphone.
  - I2S capture, two-channel mix, DC removal, deglitch/smoothing, filters, AGC/compressor/limiter, PCM16 output.
  - WiFi/server settings are supplied through build flags; real credentials are not committed.
  - Current transport is UDP to backend port 3001.
- Backend:
  - Node.js `web-monitor` receives UDP audio, fans realtime data through WebSocket, manages scan metadata, and exposes REST APIs.
  - Firebase token verification and backend-derived roles/capabilities should be described.
  - Mention JSON demo mode and PostgreSQL production direction separately.
- Android:
  - Account flows, doctor pending approval, patient/family profile selection before scan, live audio, medical records, sharing, chatbot.
- Web admin:
  - Platform Admin Console and Workspace Portal direction.
  - Doctor approval, workspaces/clinics, doctors/staff, patients, devices, scans, storage, notifications, packages, audit/reporting.
- Data model:
  - User, workspace/organization, membership, patient profile, device, scan/session, audio file, AI result, notification, audit/access log, share/access grant.

### 5. Implementation Evidence

Add a concise implementation section or expand Chapter 4 with proof that the system really runs.

Required evidence to capture:

- Firmware:
  - Captured: `platformio.exe run` build output in `report-evidence\2026-06-05\firmware-platformio-run.log`.
  - Captured build result: success, RAM about 14.1%, flash about 21.3%.
  - Pending: serial monitor showing I2S/audio metrics such as peak/RMS and UDP packet activity. On 2026-06-05, `platformio device list` only detected COM3/COM4 Bluetooth links, not COM6/ESP32-S3.
  - A note that secrets are configured locally and not committed.
- Backend:
  - Captured: `npm run check` in `report-evidence\2026-06-05\backend-npm-check.log`.
  - Captured: `npm run smoke:workspace-access` in `report-evidence\2026-06-05\backend-smoke-workspace-access.log`.
  - Captured: backend runtime smoke in `report-evidence\2026-06-05\backend-runtime-smoke.log`, including `/api/health` 200, WebSocket `/app` 101 upgrade, and a 320-byte UDP audio test packet.
- Android:
  - Captured: `.\gradlew.bat :app:compileDebugKotlin` in `report-evidence\2026-06-05\android-compile-debug-kotlin.log`.
  - Captured: `.\gradlew.bat :app:assembleDebug` in `report-evidence\2026-06-05\android-assemble-debug.log`.
  - Captured screenshots: login, personal signup, and facility-doctor signup in `report-evidence\2026-06-05\screenshots\android`.
  - Pending screenshots: authenticated profile selection/new scan, live listen, medical records/share, chatbot, and notifications.
- Web admin:
  - Captured: `npm run build` in `report-evidence\2026-06-05\web-admin-npm-build.log`.
  - Captured after fix: `npm run build` in `report-evidence\2026-06-05\web-admin-npm-build-after-overview-fix.log`.
  - Captured build result: success with Vite bundle-size warnings for large export-related chunks.
  - Captured screenshots: login, dashboard, doctor approval, clinics/workspaces, doctors, patients, devices, AI measurements, storage, packages, notifications, audit log, settings, and account menu in `report-evidence\2026-06-05\screenshots\web-admin`.
  - Fixed during screenshot capture: `Overview.tsx` now imports `Users` from `lucide-react`, resolving the dashboard runtime crash.
- Audio evidence:
  - Captured: existing backend WAV metadata and waveform in `report-evidence\2026-06-05\audio`.
  - Note: this proves persisted audio artifact/report visualization, not a fresh same-day physical-board capture.
- End-to-end demo:
  - Device sends audio.
  - Backend receives it.
  - App/web listens realtime.
  - Scan is saved and visible in history/admin.

### 6. Experiment And Evaluation

Current Chapter 4 mostly lists planned tests. It needs actual result rows:

- Environment table:
  - ESP32-S3 board, MSM261S4030H0 microphone, PC OS, Node version, Android device/emulator, Firebase project, local network.
- Test result table:
  - Test case.
  - Expected result.
  - Actual result.
  - Evidence file/screenshot/log name.
  - Status: pass/partial/fail.
- Audio quality:
  - Include qualitative result if no clinical dataset exists.
  - Show waveform or saved WAV evidence if available.
  - Do not claim diagnostic accuracy without validated data.
- Stability:
  - Record how long realtime audio ran during demo.
  - Record known dropouts/noise/latency limitations.
- Security:
  - Show Firebase Auth and backend authorization behavior at prototype level.
  - Keep production security items in future work.

### 7. Conclusion And Future Direction

Keep the conclusion grounded:

- Achieved:
  - Built a multi-component Smart Health prototype.
  - Demonstrated audio capture, realtime transport, scan management, Android app, web admin, and support AI/chatbot direction.
- Limitations:
  - No clinical validation.
  - Demo UDP audio path is not production-secure.
  - JSON/demo persistence is not final production storage.
  - TinyML/chatbot are advisory and not medical diagnosis.
- Future development:
  - Captive portal or BLE provisioning, secure NVS device secret lifecycle.
  - MQTT control plane for heartbeat, telemetry, commands, OTA events.
  - Authenticated TLS/WSS realtime audio and HTTPS chunk upload for durable scans.
  - PostgreSQL as runtime source of truth.
  - S3-compatible object storage, Redis/BullMQ worker queue, FCM delivery, immutable audit.
  - Larger PCG/lung sound dataset, model evaluation, clinical workflow review, regulatory/security hardening.

## Immediate Work Order

1. Freeze feature scope for the KLTN report draft.
2. Done on 2026-06-05: run and capture verification evidence for firmware, backend, Android, and web admin in `report-evidence\2026-06-05`.
3. Done as first pass on 2026-06-05: generated `PL2 (3)-IEEE references.report-ready-20260605.docx` with a new Chapter 4 technical verification section and Appendix D evidence mapping.
4. Done as final evidence pass on 2026-06-05: generated `PL2 (3)-IEEE references.final-evidence-20260605.docx` with updated Chapter 4 results, post-KLTN roadmap, Appendix D evidence tables, representative web/Android screenshots, and audio waveform.
5. Refresh references/citations after adding any new claims.
6. Before claiming full hardware demo, capture real ESP32-S3 serial monitor/upload and a fresh end-to-end audio session. This remains blocked until the board is detected as a serial port.
7. Only after the report evidence is complete, continue development with the production firmware/backend slice:
   - provisioning and secure local configuration,
   - MQTT control plane,
   - authenticated WSS/HTTPS scan transport,
   - runtime PostgreSQL/object storage hardening.

## Things Not To Overclaim In The Report

- Do not claim the prototype is a certified medical device.
- Do not claim diagnostic accuracy without a validated dataset and metrics.
- Do not describe the current UDP audio path as production-secure.
- Do not describe JSON demo persistence as the final database architecture.
- Do not present chatbot output as medical advice.
- Do not describe device quota as patient capacity; one activated device can measure many patient profiles.
