# Backend Foundation Production Notes

Moc production dau tien chuan hoa request context va loi API cho ca `/api` va `/api/v1`.

Moi request API co `X-Request-Id` trong response. Loi moi tra ve dang:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Khong co quyen truy cap.",
    "requestId": "req_..."
  },
  "message": "Khong co quyen truy cap.",
  "code": "forbidden",
  "statusCode": 403,
  "requestId": "req_..."
}
```

Top-level `message`, `code`, `statusCode` duoc giu de frontend cu khong bi vo.

Nhung luong sau da bat dau di qua repository layer, co JSON fallback va PostgreSQL dual-write khi `DATA_BACKEND=postgres`:

```http
GET    /api/admin/doctor-requests
POST   /api/admin/doctor-requests/:id/approve
POST   /api/admin/doctor-requests/:id/reject
POST   /api/admin/doctor-requests/:id/request-info
GET    /api/admin/doctors
PATCH  /api/admin/doctors/:id/lock
PATCH  /api/admin/doctors/:id/unlock
GET    /api/notifications
POST   /api/notifications/read-all
POST   /api/notifications/:id/read
DELETE /api/notifications/:id
```

Audit append-only duoc ghi cho:

- `doctor.approve`
- `doctor.reject`
- `doctor.request_info`
- `doctor.lock`
- `doctor.unlock`
- `notification.read`
- `notification.delete`

Migration tu JSON sang PostgreSQL:

```powershell
cd web-monitor
$env:DATABASE_URL="postgresql://smart_health:smart_health_dev@localhost:5432/smart_health"
npm run migrate:json
```

Script migration idempotent theo `id`, co the chay lai de dong bo `organizations`, `users`, `memberships`, `patients`, `devices`, `notifications`, `accessLogs`, `auditLogs` va export jobs sang cac bang normalized. Export artifact metadata duoc tai tao va doi soat, khong tin vao size/hash legacy.

Khi `DATA_BACKEND=postgres`, backend se hydrate cac bang normalized `organizations`, `users`, `memberships`, `patients`, `devices`, `notifications`, `audit_logs` vao runtime luc khoi dong. Cach nay giu duoc demo cu nhung cho phep Postgres tro thanh nguon du lieu chinh cho cac luong foundation.

Smoke test Postgres sau khi da chay migration:

```powershell
cd web-monitor
$env:DATABASE_URL="postgresql://smart_health:smart_health_dev@localhost:5432/smart_health"
npm run migrate
npm run migrate:json
npm run smoke:postgres
```

`smoke:postgres` chay trong transaction rollback, kiem tra cac cot foundation, insert thu organization/user/patient/device/notification/audit va xac nhan `audit_logs` append-only trigger dang hoat dong.

Reserved contract direction cho cac moc sau:

- MQTT chi dung cho command, telemetry, heartbeat va OTA event.
- Audio realtime dung WSS; file scan ben vung dung HTTPS chunk upload.
- Object storage se la S3-compatible: MinIO local, R2/S3 production.
- Audio worker/AI worker se dung queue rieng, khong nam trong moc foundation nay.

## Production Runtime Add-ons

Da bo sung cac adapter optional de backend khong crash khi local chua co Redis/S3/MQTT:

```powershell
npm run worker
npm run smoke:storage
npm run smoke:mqtt
npm run smoke:api-production
```

API production moi:

```http
POST /api/v1/scans
POST /api/v1/scans/:scanId/audio-chunks
POST /api/v1/scans/:scanId/complete
GET  /api/v1/scans/:scanId/audio-url
GET  /api/v1/notifications/unread-count
POST /api/v1/notifications/register-device
GET  /metrics
```

Hop dong push notification:

- `POST /api/v1/notifications/register-device` chi chap nhan bearer session hien tai, protocol `notificationProtocolVersion >= 2`, va tu suy ra `workspaceId` cung `authSessionId` tu backend; client khong duoc tu chon hai binding nay.
- Mot FCM token chi co mot binding canonical. Dang ky lai se chuyen atomically ca `userId`, `workspaceId`, `authSessionId`, protocol va app version.
- FCM provider message la data-only wake-up protocol v2. Payload chi co notification id, canonical user/workspace, alias compatibility va thoi diem; khong co title/body lam sang, entity id, deep link, auth session hoac app version. Android tu tao copy generic sau khi qua encrypted owner/workspace gate va tai lai inbox co xac thuc.
- Payload push gui dong thoi `workspaceId` canonical va alias tuong thich `organizationId`.
- Moi lan gui/retry deu nap lai account, membership workspace, device binding va auth-session state. Retry chi mang device ID, khong mang raw token cu de bo qua reauthorization.
- Unregister chi vo hieu hoa token neu user, workspace va auth session hien tai van so huu dung binding.

Hop dong upload audio theo chunk:

- `POST /api/v1/scans/:scanId/audio-chunks` bat buoc co `Idempotency-Key`, `X-Chunk-Sequence` bat dau tu `0` va lien tuc, `X-Chunk-SHA256` khop SHA-256 cua body `application/octet-stream`.
- Retry dung cung key, sequence, digest va payload se replay ket qua cu, ke ca sau khi completion da dong ledger; doi payload/key mapping, ghi de sequence hoac nhay sequence tra `409`.
- Digest khong khop body tra `422`; header thieu/sai tra `400`.
- Gioi han production: moi chunk toi da `1 MiB`, moi scan toi da `32 MiB` va `32.768` chunk. Qua gioi han tra `413` truoc khi ghi file/ledger; database va JSON importer lap lai cung guard.
- `POST /api/v1/scans/:scanId/complete` bat buoc co `Idempotency-Key`; exact retry replay response da luu va khong enqueue trung.
- Completion `processing` giu lease 15 phut tinh tu `updatedAt`. Retry cung exact tenant/actor/key sau lease co the reclaim atomically; retry truoc han tra `in_progress`. Moi lan reclaim sinh lease token moi, nen worker cu khong the finish/mark failed len generation moi.
- Response replay co header `Idempotency-Replayed: true`. Ledger va mutation van duoc tenant/capability scope nhu scan goc.
- Chunk/completion PostgreSQL truy van theo cap `(scanId, organizationId)` va co composite FK ve scan de chan row lech tenant.
- Sau khi completion da commit va WAV/queue outcome da ben vung, file PCM tam duoc xoa; retry completion van replay response ledger.
- `POST /api/v1/scans/:scanId/reprocess` cung bat buoc `Idempotency-Key`. Cung key replay generation cu; key moi tao generation moi. Generation, intent, artifact fingerprint, run ID va lien ket audio/AI duoc luu trong PostgreSQL de job ID khong doi sau restart.
- Worker ghi scan/audio/AI trong mot transaction PostgreSQL (hoac mot JSON critical section co rollback) va dung deterministic artifact ID, nen retry cung processing generation khong tao AI row trung.

Device control plane optional:

- `MQTT_URL` bat MQTT backend client.
- Backend subscribe `devices/+/telemetry` va `devices/+/events`.
- Backend publish command/OTA qua `devices/{deviceId}/commands`.

Storage:

- `OBJECT_STORAGE_PROVIDER=local` mac dinh ghi object vao `data/objects`.
- `OBJECT_STORAGE_PROVIDER=s3` dung MinIO/R2/S3 voi `OBJECT_STORAGE_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`.
- Signed URL local tra ve route protected `/api/v1/objects/local?key=...`; S3 tra presigned URL that.

## Canonical Audit Ledger And Export Artifacts

Audit history now reads from one canonical ledger instead of the legacy access-log projection:

```http
GET /api/v1/audit-logs
GET /api/v1/access-logs       # compatibility-window alias
GET /api/v1/portal/audit-log  # Portal alias; unversioned /api route remains compatible
```

- Search, action, resource type, actor, date range, sort, page and limit are validated and applied on the server before pagination.
- Audit metadata is recursively redacted when it is written. Password, OTP/TOTP/recovery code, token, claim/verification code, proof-of-possession, session/cookie, API key, credential and private-key-shaped fields are stored as redacted values rather than relying only on display-time masking.
- PostgreSQL keeps the existing append-only audit protection. JSON fallback also exposes append-only create semantics; there is no update/delete path for an existing audit event.
- Audit export requires `platform.audit.export` or `workspace.audit.export`. A Platform Admin may create a platform-global audit snapshot; a workspace owner/admin is constrained to the active workspace. Doctors, patients, billing and viewer roles cannot export the audit ledger.

Export jobs use additive migration `043_multi_format_exports.sql` and a versioned renderer:

```http
GET  /api/v1/exports
POST /api/v1/exports
GET  /api/v1/exports/download/:exportId
```

- Artifacts are produced by the backend as real JSON, UTF-8 CSV, OpenXML XLSX or PDF bytes. Every job stores the immutable snapshot scope, dataset, filters, SHA-256 and renderer version. New jobs use `shcare.export-artifact.v2`, whose recursively canonical JSON ordering keeps the bytes and hash stable after a PostgreSQL `jsonb` round trip; `v1` remains readable for compatible historical jobs.
- Clinical export authority is explicit: Platform Admin selects a workspace; workspace owner/admin exports the current workspace; doctor output is limited to currently granted patients; patient output is limited to owned/dependent profiles; billing and viewer are denied.
- Limited actors can list/download only their own jobs. Workspace export managers can manage jobs in their workspace, and a workspace actor cannot read a platform-global or another-workspace artifact.
- Create requires `Idempotency-Key`; exact replay returns the same job and does not append another `export.create` audit event. Successful download is audited separately. The workspace regression performs and revokes a temporary doctor grant so cleanup uses the audited lifecycle.
- JSON-to-PostgreSQL reconciliation regenerates and verifies artifact metadata instead of trusting legacy size/hash fields. The bundled JSON tenant mismatch and dangling patient owner were remediated with explicit audit events; `smoke:identity-migrations` now accepts the bundled dataset.

Current source/local gates:

```powershell
npm.cmd run check:audit-export
npm.cmd run smoke:audit-export
npm.cmd run smoke:repositories
npm.cmd run smoke:identity-migrations
npm.cmd run smoke:workspace-access
npm.cmd test
npm.cmd run smoke:klt-contract
```

The focused audit/export unit gate passes 12/12, and the additive OpenAPI document is now `info.version: 0.5.0`. These checks do not prove migration 043 on a live PostgreSQL database, authenticated preview/live downloads, provider behavior or deployment.

## Personal Notification Preferences

```http
GET   /api/v1/me/notification-preferences
PATCH /api/v1/me/notification-preferences
```

- GET tra snapshot canonical cua chinh tai khoan da xac thuc, gom `userId`, `workspaceId`, cac cloud preference va trang thai kha dung rieng cua `inApp`, `email`, `push`.
- PATCH bat buoc `Idempotency-Key` va body chinh xac mot cap `{ "key", "enabled" }`. Client khong duoc gui ca map cu, channel local hoac user/workspace identity.
- Mutation chi cho self, nap lai active account, cap nhat mot JSONB field atomically, ghi audit va idempotency trong cung transaction. Exact retry replay outcome cu; fingerprint reuse bi tu choi; loi save rollback user/audit/idempotency.
- Portal va Android phai kiem tra exact owner/workspace/value truoc khi thong bao thanh cong. Android system notification channel tu quan ly sound/vibration/display, khong phai cloud preference.
- Push/campaign resolve global va category opt-out tu canonical recipient o moi delivery attempt. Recipient/workspace/content binding la immutable; revoked membership, stale auth session hoac token reassign deu fail closed.
- Gate hien tai: shared contract `20/20`, notification preferences `18/18`, push `9/9` va campaign `8/8`. Day la source/local proof, khong thay the live PostgreSQL/provider/FCM proof.

## Clinical Review and Alert Ledgers

```http
GET  /api/v1/portal/review-queue
POST /api/v1/portal/review-queue/:scanId/decision
GET  /api/v1/portal/alerts
POST /api/v1/portal/alerts
POST /api/v1/portal/alerts/:alertId/acknowledge
POST /api/v1/portal/alerts/:alertId/resolve
```

- Review reads require `workspace.review.view|manage` or platform equivalents; decisions require manage authority and backend scan access. Alert reads and transitions use the matching `workspace.alerts.*|platform.alerts.*` capabilities plus source-device/scan authority.
- Every list and mutation response carries the canonical `workspaceId`. Rows retain `organizationId`; clients must reject missing, duplicate or cross-workspace source identities before rendering clinical content or success.
- Mutations require `Idempotency-Key`, optimistic `expectedVersion` and an exact backend receipt. Review success confirms the scan, decision, note, reviewer and newer version. Alert success confirms the alert, requested lifecycle state, actor/timestamp evidence and newer version.
- JSON and PostgreSQL repositories keep review/alert mutation, audit and idempotency receipt atomic. Alert dedupe applies only to active source occurrences; recurrence after resolution receives a new alert identity linked to the prior occurrence.
- Shared HTTP v1 JSON schemas/fixtures and additive OpenAPI `0.5.0` publish these contracts. `/api/portal/...` remains a compatibility alias while clients migrate.
- Current source/local gates pass clinical workflow `8/8`, workspace-access, package contracts `31/31`, Web authority/UI gates and OpenAPI `76` paths / `394` internal references / none missing. This is not live PostgreSQL, provider, deployment or physical-device proof.

## Portal Live Monitoring Fallback And Authenticated WSS

```http
GET /api/v1/portal/monitoring
GET /api/portal/monitoring # compatibility-window alias
```

- The backend derives the operational workspace from the authenticated membership and returns `generatedAt`, exact `workspaceId`, sanitized devices, scoped scans, scoped clinical alerts and a bounded recording status.
- Device `online` is derived only from an authenticated current device socket. Legacy `connected` remains compatibility data and must not be interpreted as presence by Web or Android.
- Public monitoring rows remove device secret/claim verification material. Every scan/alert/device source remains exact-workspace scoped; the strict Web parser rejects foreign, duplicate or malformed identities.
- REST is fallback only. Authenticated WSS remains the product authority for status, source metadata, metrics and SHC2 PCM frames. REST does not produce waveform samples or clinical metrics.
- Authenticated WSS status does not expose global ESP/listener counts or HTTP/UDP ports. Source-bound workspace/patient/device/scan/session identity, sequence guards and cross-device isolation remain enforced.
- Current source/local proof passes Web `183/183` plus `81/81`, package contracts `32/32`, browser `987` checks, backend workspace, clinical `8/8`, device-security `41/41`, audio-v2 `4/4`, and OpenAPI `77` paths / `400` resolved references. This is not live provider, physical audio, deployment or firmware-HIL proof.

## Factory Device Provisioning And Claim Receipts

```http
POST /api/v1/devices/provision-qr
POST /api/v1/devices/pair
```

- Provision is Platform Admin-only and requires an exact existing
  factory-enrolled device. Unknown fields and browser-supplied credential fields
  are rejected; changing a factory workspace requires a separate audited transfer
  workflow. Device, audit and idempotency receipt commit atomically.
- The one-time claim/setup artifact is reconstructed only for an exact replay and
  is never stored in plaintext in the idempotency ledger. Receipt, QR and setup AP
  carry one matching device ID, claim code and expiry.
- Pair consumes a valid unclaimed factory claim under backend capability and
  workspace authority. `accepted/awaiting_online` is not readiness. Only an
  authenticated current WSS socket can produce `success/online`.
- Public device rows are copied from an explicit allowlist. Unknown persisted
  metadata, factory credential aliases, command idempotency/fingerprint/payload
  and OTA token/signature/download URL never leave the backend. Provision and
  pair return smaller closed projections matching the shared HTTP v1 schemas.
- Current additive proof is shared contracts `44/44`, backend device-security
  `42/42`, repositories and workspace-access. Platform Admin contracts are
  `183/183`; Web contracts are `122/122`. Live claim still needs a disposable
  factory fixture plus audited cleanup, and physical setup/WSS proof remains
  separate from these source/local gates.
