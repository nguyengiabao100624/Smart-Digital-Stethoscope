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

- Artifacts are produced by the backend as real JSON, UTF-8 CSV, OpenXML XLSX or PDF bytes. Every job stores the immutable snapshot scope, dataset, filters, SHA-256 and renderer version `shcare.export-artifact.v1`.
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

The focused audit/export unit gate passes 12/12, and OpenAPI `info.version` is `0.4.0`. These checks do not prove migration 043 on a live PostgreSQL database, authenticated preview/live downloads, provider behavior or deployment.
