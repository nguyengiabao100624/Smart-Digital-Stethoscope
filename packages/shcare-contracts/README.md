# `@shcare/contracts`

Versioned, transport-neutral contracts for Shcare HTTP, WebSocket and device integrations. The backend is authoritative for identity, workspace scope, lifecycle and audit. Clients may generate types from these files, but they must not weaken required fields or authorization.

Device protocol v1 covers challenge-response authentication and command/status envelopes. The authentication proof is base64url HMAC-SHA256 over:

```text
smart-health-device-auth-v1\n<challengeId>\n<nonce>\n<deviceId>
```

The HMAC key is the raw 32-byte SHA-256 digest of the UTF-8 device secret. The secret itself never appears in a URL, hello message, telemetry, log or response.

Credential rotation is a two-phase WSS flow. The backend generates the candidate, stores only its verification material, and sends an `A256GCM` envelope whose key is derived from the authenticated challenge, nonce, device, and session. Firmware durably stages the candidate, reports `acknowledged`/`applying`, and reconnects with it. The backend promotes the candidate only after that proof succeeds; `auth.accepted` then identifies either the confirmed `rotation_candidate` or the canonical `current` slot when a prior confirmation response was lost. Clients must not report success until the backend exposes rotation state `confirmed`.

Audio protocol v2 uses an `audio.session.start` command to bind `workspaceId`, `patientId`, `deviceId`, `scanId` and `sessionId` before capture. Each binary frame then carries the `SHC2` magic, version, flags, network-order lengths, sequence, timestamp, sample count, `sessionId`, `scanId` and PCM16 little-endian mono 16 kHz payload. The first sequence is `0` with the `start` flag; replay/out-of-order frames are rejected and a sequence gap requires `discontinuity`. Authorized listeners receive `audio.session` metadata before normalized PCM. Raw PCM v1 remains compatibility-only behind a backend feature flag until all deployed clients cross the minimum firmware gate.

HTTP v1 publishes an explicit AI chat availability contract. A client must render `unavailable` or an empty state when no provider is configured and may only display messages carrying backend identities. It must never synthesize a local assistant response or treat an optimistic user message as persisted. POST requests use `Idempotency-Key`; a successful response contains the complete backend-confirmed timeline.

The HTTP v1 two-factor contract keeps status, enrollment, verification, login challenge and unavailable states separate. Starting enrollment never means 2FA is enabled; only a server-confirmed OTP verification may enable it or return one-time recovery codes and a bounded second-factor token.
