# Security Policy

Smart Digital Stethoscope / Smart Health handles authentication, workspace access, device management, clinical audio workflows, and health-record-style data. Please report security issues privately and responsibly.

## Supported Scope

| Component | Supported |
| --- | --- |
| `main` branch | Yes |
| Latest deployed backend/API behavior | Yes |
| Latest deployed `shcare.web.app` portal | Yes |
| Latest deployed `shcare-admin.web.app` admin console | Yes |
| Android debug/release source in this repository | Yes |
| ESP32-S3 MSM261 firmware source in this repository | Yes |
| Old branches, forks, local-only generated builds | No |

This project is still an engineering prototype and thesis product, not a certified medical device. Security reports about real authentication, authorization, privacy, secret handling, tenant isolation, and device control are still treated as high priority.

## Reporting A Vulnerability

Do not open a public GitHub issue for security problems.

Report privately by email:

- Nguyen Quang Danh: `danhnptho.word284@gmail.com`
- Nguyen Gia Bao: `nguyengiabao100624@gmail.com`

If GitHub private vulnerability reporting is enabled for the repository, you may also open a private security advisory from the repository Security tab.

## What To Include

Please include:

- Affected component: backend, Shcare Portal, Platform Admin, Android, firmware, CI/CD, Firebase, storage, or deployment
- Impact and severity estimate
- Step-by-step reproduction details
- Affected URL, route, endpoint, screen, workflow, or file
- Logs, screenshots, request IDs, or proof of concept when safe to share
- Whether any secret, token, account, clinical audio, or patient-like data may have been exposed
- Your preferred contact method for follow-up

Do not send real patient data unless the maintainers explicitly request a secure transfer method.

## Response Targets

| Step | Target |
| --- | --- |
| Acknowledge report | Within 48 hours |
| Initial triage | Within 7 days |
| High/critical mitigation | As soon as practical, normally within 30 days |
| Coordinated disclosure | After a fix, mitigation, or agreed timeline |

These are targets, not contractual guarantees. Emergency credential leaks should be rotated immediately before normal triage continues.

## Security Areas Of Interest

High-value reports include:

- Firebase ID token verification bypass
- Role, workspace, tenant, or capability escalation
- Cross-workspace access to patients, scans, devices, staff, reports, storage, audit logs, or notifications
- Admin-only action bypasses
- Email verification, password reset, session, or onboarding state flaws
- PHI exposure, insecure exports, unsafe logging, or missing encryption boundaries
- Firebase service account, GitHub secret, Render env, database, storage, device secret, or OTA password leakage
- Device registration, command, telemetry, firmware update, or OTA authorization weaknesses
- WebSocket/audio stream authorization or isolation issues
- CI/CD workflow changes that expose secrets or deploy untrusted code

## Out Of Scope

The following are usually out of scope unless they demonstrate a direct security impact:

- Social engineering against maintainers or users
- Denial-of-service tests without prior written approval
- Physical attacks on devices you do not own
- Spam, mass signup, or rate-limit-only issues without account/data impact
- Reports based only on outdated local generated builds
- Scanner output without a working reproduction or clear impact

## Safe Harbor

We will not pursue action against good-faith research that:

- Stays within accounts, workspaces, devices, and data you own or are authorized to test
- Avoids data destruction, persistence, extortion, lateral movement, and service disruption
- Does not exfiltrate secrets or PHI beyond what is necessary to prove impact
- Reports findings privately and gives maintainers reasonable time to respond

## Secret Leakage

If you believe a secret was exposed:

1. Stop using the exposed credential.
2. Report privately with the file, commit, workflow, or URL where it appeared.
3. Rotate or revoke the credential if you control it.
4. Do not paste full secrets into public issues, pull requests, screenshots, or chat logs.

Known sensitive values include Firebase service account JSON, Firebase web config where restricted, Render env vars, database URLs, S3/storage keys, PHI encryption keys, SMTP/Brevo keys, Android `google-services.json`, device secrets, Wi-Fi passwords, and OTA passwords.
