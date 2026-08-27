# Production Backend Plan

Mục tiêu của bản production là tách rõ app bác sĩ, app bệnh nhân, thiết bị ESP32 và pipeline audio/AI. Backend demo hiện tại vẫn có thể dùng cho đồ án và test LAN, nhưng khi lên cloud cần chuyển sang kiến trúc dưới đây.

## Trạng Thái Demo Đã Làm

- Backend demo có route tách vai trò `/api/doctor/*` và `/api/patient/*`, đồng thời hỗ trợ alias `/api/v1/*`.
- Patient API chỉ trả dữ liệu theo session hiện tại; app không quyết định `patientId`.
- Start scan hỗ trợ `Idempotency-Key`.
- Device API v1 chỉ provision một định danh đã factory-enroll, trả one-time claim
  cùng setup AP WPA2/PoP, rồi pair theo receipt; revoke/rotate/command/OTA là
  Platform Admin-only. API không trả `deviceSecret`, hash hay factory credential
  và không hỗ trợ unpair phá lịch sử.
- Có scaffold vận hành trong `smart-health-embedded/web-monitor`: `.env.example`, `Dockerfile`, `public/openapi.yaml`, `db/schema.sql`.

## 1. Phân Tách Plane

- Control plane: MQTT chỉ dùng cho device status, heartbeat, command, telemetry và OTA event.
- Audio plane: audio PCM/WAV realtime đi qua WSS có auth hoặc upload chunk HTTPS. Không đẩy raw audio lâu dài qua MQTT.
- Quyết định đề xuất: ESP32 dùng WSS khi cần nghe realtime, dùng HTTPS chunk khi chỉ cần lưu bản ghi ổn định.

## 2. Backend Theo Vai Trò

- Doctor API: `/api/v1/doctor/*`
  - Quản lý bệnh nhân trong phòng khám.
  - Tạo/dừng scan cho bệnh nhân được cấp quyền.
  - Xem kết quả AI, ghi chú bác sĩ, export hồ sơ.
- Patient API: `/api/v1/patient/*`
  - Chỉ xem hồ sơ và scan của chính mình hoặc hồ sơ được chia sẻ.
  - Không được tin `patientId` từ app gửi lên; backend lấy từ auth session và quan hệ DB.
  - Có endpoint riêng cho dashboard, notifications, scans, audio signed URL.
- Admin/Business API: `/api/v1/admin/*`
  - Quản lý clinic, tài khoản, thiết bị bán ra, bảo hành, gói thuê bao, khóa/mở tài khoản.

## 3. Organization Và Quyền

Các bảng tối thiểu:

```text
organizations
memberships
users
patients
doctor_patient_access
devices
clinic_devices
scan_sessions
audio_files
ai_results
notifications
notification_devices
auth_sessions hoặc refresh_tokens
device_events
audit_logs
shared_records
consents
```

Quyền truy cập lấy từ quan hệ DB:

- `doctor -> membership -> organization -> doctor_patient_access -> patient`
- `patient -> users.patientId -> patients.id`
- `device -> clinic_devices/device_claims -> organization/patient`
- `shared_records/consents` quyết định chia sẻ hồ sơ tạm thời.

## 4. Provisioning Thiết Bị

- Không hardcode SSID/password/IP trong firmware.
- Release canonical dùng QR hoặc nhập mã thủ công, sau đó captive portal của
  setup AP bảo mật; BLE chỉ được mở lại khi App + firmware có GATT/security/HIL
  cùng đợt.
- QR v1 chứa `deviceId + claimCode + expiry + setup AP SSID + WPA2 PoP`, không
  chứa `deviceSecret`. Các trường định danh, claim và expiry phải khớp chính xác.
- Backend hỗ trợ claim, rotate credential, revoke và audited owner transfer;
  không hard-delete/unpair để giả lập trạng thái.
- Claim `accepted` chưa phải kết nối thành công. App chỉ báo hoàn tất sau khi
  backend xác nhận thiết bị online trên WSS đã xác thực.
- Secret lưu trong secure storage/NVS encrypted trên ESP32.

## 5. Audio Và AI Pipeline

Trạng thái scan chuẩn:

```text
recording -> uploading -> processing -> completed
recording -> failed
processing -> failed
```

Luồng xử lý:

1. App/doctor start scan với idempotency key.
2. ESP32 gửi audio WSS hoặc HTTPS chunk vào audio ingest service.
3. Stop scan đóng session và enqueue job.
4. Worker tạo WAV, quality check, waveform preview, AI inference.
5. Lưu `modelVersion`, `aiResult`, `confidence`, `processingStatus`, `errorCode`.
6. App nhận realtime status qua WebSocket/SSE hoặc polling.

## 6. Storage

- Dùng S3/R2/Firebase Storage thay vì lưu local disk.
- Path chuẩn:

```text
org/{orgId}/patients/{patientId}/scans/{scanId}/audio.wav
org/{orgId}/patients/{patientId}/scans/{scanId}/waveform.json
```

- File truy cập bằng signed URL ngắn hạn.
- Có encryption at rest, retention policy, quota theo gói, lifecycle archive/delete.

## 7. Auth

- Nếu dùng Firebase Auth, backend verify Firebase ID token.
- PostgreSQL lưu user mapping bằng `firebaseUid`.
- Role không lấy từ app gửi lên; backend lấy từ DB/custom claims.
- Android giữ ID token bằng Firebase SDK, backend quản lý refresh/session nếu cần audit thiết bị đăng nhập.

## 8. Realtime Scaling

- WebSocket phải có auth token.
- Multi-instance cần Redis pub/sub hoặc session routing.
- Không phụ thuộc memory local như `activeRecording`; active scan phải lưu DB/Redis.
- Device heartbeat và listener presence tách khỏi audio ingest.

## 9. Notification

- FCM chỉ là kênh push.
- DB vẫn lưu notification chính, trạng thái read/unread, retry, preference theo user.
- Bảng token thiết bị Android cần hỗ trợ nhiều máy trên cùng tài khoản.

## 10. Firmware Production

- TLS/WSS hoặc HTTPS.
- Reconnect/backoff, heartbeat, device health.
- OTA update có version/rollback.
- Buffer tạm khi mạng yếu.
- Không hardcode WiFi/IP/secret.

## 11. CI/CD, Migration, Vận Hành

- Dockerfile, `.env`, OpenAPI, migrations Prisma/Knex, seed data dev.
- GitHub Actions build/test/deploy.
- Migration từ `db.json` sang PostgreSQL.
- Structured logs, metrics, error tracking, backup/restore.
- Alert: device offline, storage gần đầy, audio upload lỗi, AI job fail.

## 12. Bảo Mật Y Tế

- Audit log bất biến, append-only.
- Encrypt PHI, secret management, rate limit.
- Consent, shared-record expiry, data retention policy.
- Export log bắt buộc cho truy cập và tải hồ sơ.
