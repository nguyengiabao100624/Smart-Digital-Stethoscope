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

Script migration idempotent theo `id`, co the chay lai de dong bo `organizations`, `users`, `memberships`, `patients`, `devices`, `notifications`, `accessLogs` va `auditLogs` sang cac bang normalized.

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

Device control plane optional:

- `MQTT_URL` bat MQTT backend client.
- Backend subscribe `devices/+/telemetry` va `devices/+/events`.
- Backend publish command/OTA qua `devices/{deviceId}/commands`.

Storage:

- `OBJECT_STORAGE_PROVIDER=local` mac dinh ghi object vao `data/objects`.
- `OBJECT_STORAGE_PROVIDER=s3` dung MinIO/R2/S3 voi `OBJECT_STORAGE_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`.
- Signed URL local tra ve route protected `/api/v1/objects/local?key=...`; S3 tra presigned URL that.
