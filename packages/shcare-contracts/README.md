# `@shcare/contracts`

Versioned, transport-neutral contracts for Shcare HTTP, WebSocket and device integrations. The backend is authoritative for identity, workspace scope, lifecycle and audit. Clients may generate types from these files, but they must not weaken required fields or authorization.

The personal Patient Dashboard uses `patient-dashboard-snapshot.schema.json` as
the atomic payload nested at `GET /api/v1/patient/dashboard` response
`dashboard`. Its `userId`, `workspaceId` and `activePatientId` are exact
backend authority; every recent scan belongs to that active profile and the
optional device belongs to the same owner/workspace and either that profile or
the unassigned state. Patient, scan and device entries are closed summary DTOs:
raw clinical notes, provider/AI output, waveform/storage paths, network
configuration and credential/OTA internals are never part of this response.
Every scan carries the exact response workspace, with backend-only legacy
resolution during the compatibility window. `online` means authenticated
backend presence; legacy `connected` is not exposed. Nullable battery/signal
values mean telemetry is unknown rather than a client-invented default.

Device protocol v1 covers challenge-response authentication and command/status envelopes. The authentication proof is base64url HMAC-SHA256 over:

```text
smart-health-device-auth-v1\n<challengeId>\n<nonce>\n<deviceId>
```

The HMAC key is the raw 32-byte SHA-256 digest of the UTF-8 device secret. The secret itself never appears in a URL, hello message, telemetry, log or response.

HTTP device onboarding is a separate, closed contract layered on that factory
identity:

- `device-provision-request.schema.json` lets Platform Admin name and classify an
  existing factory-enrolled `deviceId`; it cannot create identity or submit a
  secret, hash or factory credential. `Idempotency-Key` is header-only.
- `device-provision-response.schema.json` returns one bounded public device
  projection plus a one-time claim/setup artifact. The exact device ID, claim
  code and expiry must match across the receipt and QR payload; setup uses a
  per-device `WPA2_PSK` proof-of-possession. Plaintext claim/setup material is
  never persisted in the idempotency ledger.
- `device-pair-request.schema.json` accepts only the provisioned device ID,
  one-time claim code, canonical `QR|Manual` method and the exact active
  `organizationId`. The field is a required mutation precondition, not client
  authority: backend membership plus the factory record still decide access,
  and omission or mismatch fails closed.
- `device-pair-response.schema.json` distinguishes a committed backend claim
  (`accepted/awaiting_online`) from device readiness
  (`success/online/authenticatedTransport=wss`). Web, Admin and Android must not
  promote the first state to connected success.

Credential rotation is a two-phase WSS flow. The backend generates the candidate, stores only its verification material, and sends an `A256GCM` envelope whose key is derived from the authenticated challenge, nonce, device, and session. Firmware durably stages the candidate, reports `acknowledged`/`applying`, and reconnects with it. The backend promotes the candidate only after that proof succeeds; `auth.accepted` then identifies either the confirmed `rotation_candidate` or the canonical `current` slot when a prior confirmation response was lost. Clients must not report success until the backend exposes rotation state `confirmed`.

Platform device operations use closed HTTP v1 contracts in addition to the
wire envelope: `device-command-*` restricts the generic endpoint to the three
non-credential command types and separates backend acceptance from device
`applied`; remote `wifi.update` is forbidden because Wi-Fi credentials are
provisioned only through the device-local secure setup AP and must never enter
the backend command, audit or idempotency ledger;
`device-revoke-response` records the committed, audited revocation;
`device-credential-rotation-*` exposes only the public two-phase state; and
`device-ota-*` covers the server-signed request, bounded acceptance receipt and
reconciled status. Public receipts never expose Wi-Fi material, candidate
credentials, signed download URLs, signatures, tokens or signing keys.

Audio protocol v2 uses an `audio.session.start` command to bind `workspaceId`, `patientId`, `deviceId`, `scanId` and `sessionId` before capture. Each binary frame then carries the `SHC2` magic, version, flags, network-order lengths, sequence, timestamp, sample count, `sessionId`, `scanId` and PCM16 little-endian mono 16 kHz payload. The first sequence is `0` with the `start` flag; replay/out-of-order frames are rejected and a sequence gap requires `discontinuity`. Authorized listeners receive `audio.session` metadata before normalized PCM. Raw PCM v1 remains compatibility-only behind a backend feature flag until all deployed clients cross the minimum firmware gate.

HTTP v1 publishes an explicit AI chat availability contract. A client must render `unavailable` or an empty state when no provider is configured and may only display messages carrying backend identities. It must never synthesize a local assistant response or treat an optimistic user message as persisted. POST requests use `Idempotency-Key`; a successful response contains the complete backend-confirmed timeline.

Role-request verification documents use
`role-request-document-response.schema.json` as the closed receipt for
`POST /api/v1/auth/role-request-document`. The backend binds the upload to the
authenticated account and canonical active workspace, computes SHA-256 from
the received bytes and fingerprints the exact file name, content type, size
and digest under the caller's `Idempotency-Key`. Exact retries return the same
document and operation identity without another object, record or audit event;
reusing the key for different bytes returns `409`. Object keys and storage
provider details remain private backend metadata. An account may retain at
most ten verification documents; exact replay remains available at that limit.

The HTTP v1 two-factor contract keeps status, enrollment, verification, login challenge and unavailable states separate. Starting enrollment never means 2FA is enabled; only a server-confirmed OTP verification may enable it or return one-time recovery codes and a bounded second-factor token.

HTTP v1 notification delivery is bound to the authenticated account, canonical workspace and current backend session:

- `notification-device-registration-request.schema.json` describes the `POST /api/v1/notifications/register-device` body. The client submits only the FCM token, platform, enabled flag, notification protocol version and app version. `userId`, `workspaceId` and `authSessionId` are backend authority derived from the primary session, never trusted from the body.
- `notification-device-registration-ack.schema.json` is the authoritative token acknowledgement. Before activating local delivery, the client must verify that the echoed token, `userId`, `workspaceId`, `authSessionId`, protocol version and app version all match the current registration attempt. A protocol below v2 is rejected.
- `notification-fcm-data-envelope.schema.json` is deliberately a data-only owner/workspace wake-up signal using protocol `"2"`. The backend reauthorizes account state, membership, token ownership and the stored authentication session immediately before every initial send and retry; the provider payload exposes no `authSessionId`, app version, clinical content, entity identifier or deep link. Android must match the protocol and active encrypted user/workspace binding, suppress stale cross-account or cross-workspace payloads and refresh its authenticated inbox.

Notification Settings uses the dedicated account-owned `GET`/`PATCH /api/v1/me/notification-preferences` contract instead of broad `/me` profile updates:

- `notification-preferences-response.schema.json` returns the authenticated `userId`, canonical nullable `workspaceId`, self ownership, eight account-wide preferences (`enabled` plus seven category flags), explicit in-app/email/push availability, backend `updatedAt` and replay state.
- `notification-preferences-patch-request.schema.json` changes exactly one allowed preference with `{ "key": <allowed key>, "enabled": <boolean> }`. It rejects merged preference maps, `sound`, `vibration`, provider fields and every extra property.

Sound and vibration remain native presentation behavior rather than shared backend preference authority. Neither notification-settings contract carries provider credentials, bearer/session material, tokens or deep links.

The personal Notification Inbox uses canonical account/workspace responses rather than client-owned local state:

- `notification-inbox-response.schema.json` describes `GET /api/v1/notifications/inbox`. Every returned item is owned by the authenticated `userId`, projected into the active canonical `workspaceId`, capped at 200 items and excludes disabled/skipped in-app delivery rows.
- `notification-inbox-mutation-response.schema.json` describes the idempotent receipts for `POST /api/v1/notifications/inbox/{notificationId}/read`, `POST /api/v1/notifications/inbox/read-all` and `DELETE /api/v1/notifications/inbox/{notificationId}`. A receipt contains the exact action, affected IDs and full post-mutation server snapshot; Portal and Android must not infer success locally.
- The backend checks active account/workspace authority on every request and persists the notification change, audit event and replay receipt atomically. Cross-account and stale-workspace item IDs fail closed.

`workspaceId` is canonical in all fixtures. `organizationId` is a deprecated compatibility alias only; when temporarily emitted it must equal `workspaceId`, and it never replaces the required canonical field. `authSessionId` is an opaque registration acknowledgement field, not a bearer credential and not an FCM payload field.

HTTP v1 scan artifacts are also explicit and tenant-authorized:

- `scan-waveform-response.schema.json` carries only a backend-validated waveform bound to one canonical `scanId`, with a bounded sample rate and at most 512 normalized points. A client renders unavailable/error state instead of inventing points.
- `scan-audio-access.schema.json` carries a short-lived relative same-origin URL or an HTTPS provider URL, expiry, MIME type and safe file name. New clients do not consume the compatibility-only `objectKey`; they never forward the backend bearer token to a foreign provider origin.

HTTP v1 storage and export contracts distinguish backend truth from Android-local state:

- `storage-summary-response.schema.json` reports only tenant-authorized object counts and measured byte totals. Compatibility device/cache/quota fields remain zero; Android measures its own app-private cache locally.
- `export-create-response.schema.json` binds a workspace-scoped clinical export to the authenticated creator, canonical workspace, renderer version, artifact byte size and SHA-256. Job creation is not user-visible completion: a client must download from the same backend origin, verify the declared length, MIME, renderer and SHA-256, then save through the platform document picker.

HTTP v1 clinical worklists remain workspace-bound across Portal and Android while each client keeps its own UI:

- `portal-staff-response.schema.json` is the sanitized operational staff
  ledger for one canonical workspace. Every membership repeats the exact
  `userId`, `workspaceId` and compatibility `organizationId`; the doctor
  subset may contain only active, approved, operational doctors already
  present in the staff ledger. Password material, Firebase claims, 2FA state,
  sessions and invitation tokens are forbidden.
- `patient-list-response.schema.json` requires one canonical `workspaceId` and patient rows whose `organizationId` matches that workspace. Android rejects the complete response if either boundary differs; it never mixes patients from multiple workspaces or substitutes seeded rows.
- `patient-mutation-authority.schema.json` binds every personal Family create/update/delete intent to the account, canonical workspace and backend auth session captured before dispatch through the three `X-Shcare-Expected-*` headers. Web và Android additionally pin a local `authSessionEpoch` that is never sent in the HTTP body or headers; a changed account, workspace or session fails before dispatch or at the atomic backend authority check without patient, audit or idempotency writes. `patient-mutation-response.schema.json` closes the workflow over one exact `{userId, workspaceId, patientId, intent}` receipt. Create/update include the original canonical patient snapshot; delete includes `deleted:true`. Exact retries only change `replayed`, and a delete replay from another selected workspace or auth session fails closed instead of reviving stale success.
- `clinical-alert-list-response.schema.json` publishes the versioned `open|acknowledged|resolved` ledger for one workspace. `clinical-alert-mutation-response.schema.json` confirms the exact alert, workspace, target status and newer optimistic version after an acknowledged mutation.
- `clinical-review-list-response.schema.json` publishes only review rows bound to one canonical workspace. `clinical-review-mutation-response.schema.json` confirms the exact scan, decision, reviewer, timestamp and newer optimistic version; clients must reject mismatched receipts before showing success.
- `portal-monitoring-response.schema.json` is the bounded REST fallback for Portal Live Monitoring. It carries one exact workspace, sanitized devices with backend-confirmed `online`, scoped scans, the canonical alert ledger and a source-bound recording status. WSS audio v2 remains the realtime authority; `connected` never substitutes for authenticated presence.
- `portal-device-list-response.schema.json` applies the same authenticated-presence and credential-sanitization rules to the operational Device screen. `patient-share-ledger-response.schema.json`, `patient-share-mutation-response.schema.json` and `share-targets-response.schema.json` bind consent, clinician access and administrative assignment to the active source workspace, exact patient, canonical recipient, lifecycle and audit actor. Cached rows may be shown as stale but cannot authorize a mutation.
- A transport timeout is ambiguous, so clients retain the original `Idempotency-Key` for retry and do not change local status. HTTP `409` is definitive stale-version evidence: clients discard the old mutation intent, block another transition while reloading the current filter and only show the refreshed backend state. A refresh is not reported as an acknowledge/resolve success.

Workspace selection is also one synchronized business contract with independent
Web and Android presentation:

- `workspace-switch-request.schema.json` permits only the canonical
  `organizationId`. The authenticated user, membership, role, capability and
  audit authority are derived by the backend; `Idempotency-Key` remains a
  caller-owned header.
- Web and Android call `PATCH /api/v1/me`, retain the same idempotency key while
  retrying the same target, and expose the new workspace only after the returned
  user or an immediate authenticated `/me` reconciliation confirms that exact
  workspace. Missing metrics are unavailable, not numeric zero.

Workspace profile updates use the exact versioned pair
`workspace-settings-update-request.schema.json` and
`workspace-settings-update-response.schema.json`. The canonical Web request
keeps `Idempotency-Key` in the header, submits no actor or workspace authority,
and retries the same normalized payload with the same key. Success is accepted
only when the transaction receipt repeats the authenticated user, active
workspace, normalized fields and `expectedVersion + 1`; the unversioned route
is a monitored, deprecated compatibility alias.
- A non-operational membership remains visible for status explanation but is
  never selectable. Web uses its Portal card/list interaction while Android
  keeps its native adaptive screen; this contract does not require pixel parity.

Portal device assignment is an operational Web workflow, not an Android
pixel-parity requirement:

- `device-assignment-request.schema.json` contains only the canonical patient
  identifier. The authenticated actor, active workspace and caller-owned
  `Idempotency-Key` are not accepted from the JSON body.
- `device-assignment-response.schema.json` is the only success authority. The
  client verifies the exact device, patient and workspace before navigating or
  announcing success. The backend commits ownership, audit and replay receipt
  together; an exact retry returns the original receipt without another audit.
- New clients call `/api/v1/portal/devices/{deviceId}` and must send
  `Idempotency-Key`. The legacy `/api/portal/devices/{deviceId}` alias accepts a
  missing key only during the backend-first compatibility window; when a key is
  supplied, the alias uses the same replay/conflict rules as v1.

Workspace billing remains a truthful, read-only manual workflow in this release:

- `billing-summary-response.schema.json` binds workspace, subscription, measured
  usage, quota, current package reference and billing contact to one authenticated
  workspace. Web rejects a snapshot whose workspace or subscription owner differs
  from the active workspace.
- `invoicePolicy.mode` is exactly `manual` and `providerConfigured` is exactly
  `false`. Clients must say that online payment is unavailable; they must not
  synthesize invoices, checkout success, unlimited quota or a zero-valued charge
  when package data is absent.
- New Web clients read `/api/v1/portal/billing`; `/api/portal/billing` remains a
  read-only compatibility alias. Billing has no Android pixel-parity requirement
  and no firmware impact.

Portal overview is also backend truth rather than a set of client fallbacks:

- `portal-overview-response.schema.json` binds the generated snapshot, requested
  time range, KPI totals and chart breakdowns to one canonical `workspaceId`.
  Web rejects another workspace, a missing KPI, negative/non-finite values or a
  breakdown whose totals contradict the summary.
- The measured series must sum to `stats.scansCount`; online/offline device
  slices must sum to `stats.devicesCount`; and processing outcome slices must
  sum to the same range-scoped scan count. `devicesOnline` and `aiJobsFailed`
  must match their named slices.
- New Web clients read `/api/v1/portal/overview` with an explicit range and local
  timezone offset. `/api/portal/overview` remains a read-only compatibility
  alias. Supplemental recent-scan failure is a partial state and must never
  erase or fabricate a confirmed overview KPI.

Portal support submission is a durable workspace ledger rather than a local
toast or a synthetic notification:

- `support-ticket-create-request.schema.json` accepts only the canonical issue
  type and a bounded description. `workspaceId`, `requesterUserId`, role,
  status and audit authority are forbidden in the client body.
- `support-ticket-create-response.schema.json` is the only success authority.
  It binds the ticket to the authenticated requester and active workspace and
  confirms the canonical type, `open` status and backend creation time.
- New Web clients call `POST /api/v1/portal/support` with an intent-stable
  `Idempotency-Key` and reject an owner/workspace mismatch or malformed receipt.
  `/api/portal/support` remains a compatibility alias. Provider/live mutation
  smoke is not run by default because the current support ledger has no
  requester withdrawal contract and therefore cannot provide cleanup proof.

Self-service password change is one account-bound, provider-confirmed mutation:

- `password-change-request.schema.json` defines the exact, non-normalized
  `currentPassword` and `newPassword` body for `POST /v1/me/password`.
  `Idempotency-Key` is a required HTTP header and is not accepted in the body.
- `password-change-response.schema.json` is the closed success receipt
  `{ok,user,provider,operationId,replayed}`. Clients verify the authenticated
  owner through the receipt's minimal `user.id`; no profile fields are returned.
  Clients do not announce success or log out before receiving this receipt.
- `password-change-error-response.schema.json` follows the standard
  `{code,message,fieldErrors?,requestId}` envelope. Neither success nor error
  responses echo passwords, credentials, tokens or provider claims.
