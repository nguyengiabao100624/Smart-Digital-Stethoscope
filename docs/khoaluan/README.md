# Smart Health KLTN Contract Pack

Last updated: 2026-07-10

This folder is the thesis-facing contract pack for the Smart Health / Smart Stethoscope system. Read it before adding more product-development scope. Its job is to keep firmware, backend, Android, web/admin, data model, demo evidence, and report claims aligned.

## Read Order

1. `01-system-contract.md` - unified system scope, actors, entities, states, API/data ownership, and implemented/partial/future boundaries.
2. `02-audio-packet-and-realtime-contract.md` - PCM packet format, firmware transport, backend WebSocket/UDP behavior, Android live-audio expectations, and simulated-evidence rules.
3. `03-demo-and-evidence-checklist.md` - repeatable KLTN demo path and exact evidence to capture.
4. `04-test-matrix-and-gap-log.md` - report-oriented matrix of implemented parts, gaps, blockers, and validation commands.

## Thesis Scope

The KLTN scope is a working end-to-end prototype:

- ESP32-S3 DevKitM-1 with MSM261S4030H0 MEMS/I2S microphone.
- Real-time audio capture and transport.
- Backend scan/session API with live metrics, WAV persistence, and AI-quality support.
- Android app for account/profile/scan/live listen/history workflows.
- Web Admin and Shcare Workspace Portal for platform/workspace operations.
- Basic chatbot/TinyML/AI support as advisory system support, not diagnosis.

## Claim Levels

Use these levels consistently in the report:

| Level | Meaning |
| --- | --- |
| Implemented demo | Source exists and local/build/smoke evidence can prove the behavior without claiming clinical production readiness. |
| Partial/scaffold | Source or UI exists, but provider, device, physical validation, or live environment proof is still missing. |
| Future production/clinical work | Needed for a commercial medical product, but not claimed as completed KLTN evidence. |

## Non-Negotiable Honesty Rules

- Do not claim certified medical-device status.
- Do not claim diagnostic accuracy without validated clinical data and metrics.
- Do not call UDP audio production-secure.
- Do not call JSON demo persistence the final production database.
- Do not present chatbot output as medical advice.
- Do not use simulated serial logs, simulated waveforms, or mock UDP packets as physical-board evidence.
- If no ESP32-S3 board or Android device is attached, record that as a blocker and keep the source/build/smoke proof separate.
