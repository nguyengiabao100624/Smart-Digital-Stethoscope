# Smart Health KLTN Unified System Contract

Last updated: 2026-07-10

This document defines the contract that must stay consistent across firmware, backend, database/repository, Android, web portal, Web Admin, test evidence, and KLTN report text.

## System Boundary

Smart Health in the KLTN report is one connected prototype, not separate apps:

| Surface | Source path | KLTN responsibility |
| --- | --- | --- |
| Firmware | `smart-health-embedded/MSM261S4030H0` | Capture MSM261S4030H0 I2S audio on ESP32-S3, process to PCM16, send audio to backend, expose telemetry/OTA hooks. |
| Backend/API | `smart-health-embedded/web-monitor` | Auth, roles, devices, patients, scan/session lifecycle, live audio fanout, WAV persistence, AI-quality result, notifications, audit, storage/repository layer. |
| Android | `smart-health-android` | User auth/profile, family profile selection, live monitoring, medical record view/share, privacy/session/security settings, chatbot/support. |
| Shcare Portal | `smart-health-web` | Workspace operations for clinics/doctors/workspace admins: patients, devices, appointments, scans, consent, reports, billing, settings. |
| Platform Admin | `smart-health-admin` | Platform-level workspace/doctor approval, user/device/package/storage/AI/audit operations. |
| Docs/evidence | `docs`, `docs/report-evidence` | Thesis narrative, proof logs/screenshots/audio evidence, limitations, and future work. |

## Actors And Access

| Actor/role | Main surface | Core permissions expected in thesis scope |
| --- | --- | --- |
| Patient/personal user | Android | Manage own/family profiles, start/view scans, manage consent/share history, notifications, privacy/session settings. |
| Doctor | Android + Shcare Portal | View assigned/shared patients, create/review scans, appointments, notes, AI support, notifications. |
| Workspace admin/clinic owner | Shcare Portal | Manage workspace patients, devices, appointments, staff, reports, billing, settings, consent workflows. |
| Platform admin | Web Admin | Approve workspaces/doctors, manage packages, devices, admin accounts, storage, AI measurements, audit. |
| Device | Firmware/backend | Authenticate/register, stream audio, send telemetry/events, receive commands/OTA. |

Client applications must not self-assign role, workspace, device ownership, or patient access. Backend authorization and repository policy are the source of truth.

## Shared Domain Entities

| Entity | Required fields/concepts | Owner of truth |
| --- | --- | --- |
| User | id, email/phone, display name, role, approval status, allowed surfaces, capabilities, Firebase UID/claims, profile metadata | Backend repository + Firebase Auth identity |
| Workspace/organization | id, name, type, owner, address/contact, package/subscription, usage/quota | Backend repository/Postgres when available |
| Membership | user, workspace, role, capability set, active workspace context | Backend repository |
| Patient profile | id, patient code, name, age/gender/contact, family relationship, organization/personal owner | Backend repository |
| Device | id, serial/device id, type, owner workspace/patient, status, battery/RSSI, secret/claim state, OTA/command state | Backend repository + firmware telemetry |
| Scan/session | id, patient, device, mode, body site, status, sample rate, metrics, start/end time, audio/AI links | Backend scan lifecycle |
| Audio file | scan id, object key/path, content type, size, sample rate, created time | Backend storage/repository |
| AI result | scan id, model/version, label, confidence, summary, waveform/quality metadata | Backend AI/worker path |
| Appointment/consultation | patient, doctor/workspace, scheduled time, status, notes | Backend appointment repository |
| Consent/share grant | patient, doctor/workspace target, scope, scan ids, expiry, revoke metadata | Backend patient-share repository |
| Notification | target user/workspace, channel, read state, provider attempts | Backend notification service |
| Audit/access log | actor, action, resource, request id, timestamp | Backend audit path |

## Scan Lifecycle Contract

| State | Meaning | Required side effects |
| --- | --- | --- |
| `created` / uploaded | Metadata exists before processing or after chunk upload starts | Patient/device/user access checked. |
| `recording` | Active live scan is capturing PCM payloads | Backend writes raw PCM, broadcasts binary audio and metrics, updates `activeScanId`. |
| `completed` | Scan stopped and WAV/AI metadata are saved | WAV file exists, audio file row exists, AI-quality result exists or is queued/completed. |
| `interrupted` | Recording stopped without a complete active stream | No fake WAV success; report explains interruption. |
| `queued` / `processing` | Redis/BullMQ or inline AI path is pending/running | Source/build can prove queue code; live queue proof requires Redis env. |
| `deleted` | Scan removed by authorized actor | Audio/AI artifacts and audit behavior follow backend policy. |

## Status Mapping

| Firmware/backend signal | Backend field/event | Android/web display |
| --- | --- | --- |
| ESP/WSS connected or UDP source seen | `status.esp`, `wsEsp`, `udpEsp`, device `connected/status` | Connected device count, online/available device status. |
| Active scan recording | `recording=true`, `activeScanId` | Live Monitoring shows active scan; Records can mark item as recording. |
| Live audio metrics | `metrics.peak`, `metrics.rms`, `metrics.levelPercent`, `metrics.bpm` | Waveform/quality/heart-rate style display; advisory only. |
| Scan saved | scan `completed`, `audioUrl`, `aiLabel`, `aiSummary` | Medical record detail/history and admin AI measurements. |
| Stream interrupted | scan `interrupted`, `aiSummary` reason | User sees scan incomplete; no successful diagnostic claim. |

## API And Data Ownership

| Contract area | Current runtime path | KLTN report claim |
| --- | --- | --- |
| Auth/session | Firebase Auth plus backend role/capability lookup | Implemented prototype identity/role flow; not a complete regulated IAM system. |
| Scan/session REST | `/api/v1/scans`, `/api/portal/*`, `/api/doctor/*` compatible routes | Implemented prototype scan/session API with role scoping. |
| Live audio | WebSocket `/app`/`/listen` for listeners; `/esp`/`/device` for device WSS; UDP fallback on `AUDIO_UDP_PORT` | Implemented live transport prototype; UDP is local/demo fallback. |
| Persistence | JSON fallback plus PostgreSQL repositories/migrations for many core modules | Partial production direction; do not claim every handler is Postgres-only unless verified. |
| Object/audio storage | Local object storage plus S3-compatible direction | Partial; local evidence is valid for prototype, provider proof needs env. |
| AI | Signal-quality processor and worker path | Advisory support; no diagnostic accuracy claim. |

## Report Boundary

The report may say the prototype demonstrates the full software path from device/source audio to backend session, live listener, saved WAV, and app/admin visibility. It must also say that physical ESP32-S3 serial/audio proof, clinical validation, secure production audio transport hardening, and live provider proofs are separate validation items when they are not freshly captured.
