# API Máy Chủ Smart Health

Máy chủ này kết nối ống nghe ESP32 với ứng dụng:

- ESP32 gửi âm thanh PCM16 mono 16 kHz little-endian qua UDP `3001` hoặc WebSocket `/esp`.
- Ứng dụng nghe âm thanh và chỉ số theo thời gian thực qua WebSocket `/app` hoặc `/listen`.
- Ứng dụng lưu hồ sơ đo bằng REST API dưới `/api`.
- Metadata mặc định lưu trong `data/db.json` khi chạy nhanh. Khi đặt `DATA_BACKEND=postgres` và `DATABASE_URL`, runtime backend đọc/ghi state qua PostgreSQL.
- Âm thanh của lượt đo đã hoàn tất được lưu dạng WAV trong `data/audio`.
- Đặt `DATA_DIR=C:\tmp\smart-health-data` nếu muốn lưu dữ liệu ngoài thư mục `web-monitor\data`.

## Chạy Máy Chủ

```powershell
cd web-monitor
npm start
```

Dùng URL LAN mà máy chủ in ra cho ứng dụng điện thoại. Firmware MSM261S4030H0 hiện gửi âm thanh qua UDP, nên cần đặt `AUDIO_HOST` trong firmware thành IP của máy tính đang chạy máy chủ.

File vận hành mới:

- `.env.example`: cấu hình cổng, `DATA_DIR`, CORS và biến cloud sau này.
- `Dockerfile`: chạy backend trong container, cài dependency Node và copy `src/`, `scripts/`, `db/`.
- `docker-compose.yml`: dev stack gồm backend, PostgreSQL, Redis và MinIO.
- `db/migrations/001_init.sql`: migration PostgreSQL đầu tiên cho organization/user/patient/device/scan/audio/AI/audit/session.
- `db/seeds/dev.sql`: seed dữ liệu dev cho bác sĩ, bệnh nhân, thiết bị và phòng khám.
- `FIREBASE_SETUP.md`: hướng dẫn tạo Firebase project, Android app, service account và custom claims.
- `public/openapi.yaml`: contract OpenAPI ban đầu cho `/api/v1`.
- `db/schema.sql`: trỏ về migration đang là source of truth.

## PostgreSQL Runtime

```powershell
cd web-monitor
docker compose up -d postgres redis minio
$env:DATABASE_URL="postgresql://smart_health:smart_health_dev@localhost:5432/smart_health"
$env:DATA_BACKEND="postgres"
npm run migrate
npm run seed
npm start
```

Nếu chưa cấu hình `DATABASE_URL`, backend tự fallback về JSON để demo nhanh.

## Firebase Auth Production

Backend hỗ trợ Firebase ID token khi bật:

```powershell
$env:AUTH_MODE="production"
$env:ALLOW_DEMO_AUTH="false"
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-service-account.json"
```

Android gửi:

```http
Authorization: Bearer <firebase-id-token>
```

Kiểm tra token:

```http
GET /api/v1/auth/firebase
```

Set role ban đầu cho user Firebase:

```powershell
npm run firebase:claims -- <firebaseUid> doctor org_default_clinic
```

UID demo của bạn có thể set nhanh bằng:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setSmartHealthDemoClaims.ps1 -ServiceAccountPath "D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
```

Chi tiết từng bước nằm trong `FIREBASE_SETUP.md`.

Khi `AUTH_MODE=production` và `ALLOW_DEMO_AUTH=false`, `/api/v1/auth/login`, `/api/v1/auth/register` và đổi mật khẩu demo sẽ bị khóa. Backend chỉ chấp nhận Firebase ID token hoặc session đã được revoke/track đúng cách.

## WebSocket Thời Gian Thực

Ứng dụng kết nối đến:

```text
ws://<ip-may-chu>:3000/app
```

Frame nhị phân nhận vào là âm thanh PCM16 thô:

```text
sampleRate: 16000
channels: 1
bitsPerSample: 16
endianness: little-endian
```

Frame text nhận vào:

```json
{
  "type": "status",
  "esp": 1,
  "listeners": 1,
  "recording": false,
  "activeScanId": null,
  "sampleRate": 16000
}
```

```json
{
  "type": "metrics",
  "peak": 1234,
  "rms": 120,
  "levelPercent": 1,
  "bpm": 72,
  "recording": true,
  "activeScanId": "scan_..."
}
```

Ứng dụng cũng có thể gửi:

```json
{ "type": "ping", "id": 1, "sentAt": 123.4 }
```

```json
{
  "type": "start_scan",
  "payload": {
    "patientId": "pat_...",
    "mode": "heart",
    "bodySite": "mitral",
    "deviceId": "esp32-stethoscope"
  }
}
```

```json
{ "type": "stop_scan", "scanId": "scan_..." }
```

## REST API

### Kiểm Tra Máy Chủ Và Trạng Thái

```http
GET /api/health
GET /api/status
```

### Bệnh Nhân

```http
GET    /api/patients?q=<tu-khoa>
POST   /api/patients
GET    /api/patients/:id
PATCH  /api/patients/:id
DELETE /api/patients/:id
```

Tạo bệnh nhân:

```json
{
  "patientCode": "BN001",
  "name": "Nguyễn Văn A",
  "age": 22,
  "gender": "male",
  "phone": "0900000000",
  "notes": "Tái khám"
}
```

### Lượt Đo

```http
GET   /api/scans?patientId=<id>&status=completed&limit=50
POST  /api/scans/start
POST  /api/scans/active/stop
GET   /api/scans/:id
PATCH /api/scans/:id
POST  /api/scans/:id/stop
GET   /api/scans/:id/audio
```

Bắt đầu lượt đo:

```json
{
  "patientId": "pat_...",
  "mode": "heart",
  "bodySite": "aortic",
  "deviceId": "esp32-stethoscope",
  "doctorNotes": "Nghe tim ban đầu"
}
```

Nếu bỏ trống `patientId`, máy chủ tự tạo bệnh nhân vãng lai. Cũng có thể gửi thông tin bệnh nhân trực tiếp:

```json
{
  "patient": {
    "patientCode": "BN002",
    "name": "Trần Thị B",
    "age": 35,
    "gender": "female"
  },
  "mode": "lung",
  "bodySite": "thùy dưới phổi trái"
}
```

Dừng lượt đo:

```http
POST /api/scans/:id/stop
```

Nếu ứng dụng không biết mã lượt đo đang chạy, dùng:

```http
POST /api/scans/active/stop
```

Phản hồi có `audioUrl`, ví dụ:

```json
{
  "scan": {
    "id": "scan_...",
    "status": "completed",
    "durationSeconds": 12.8,
    "bpm": 72,
    "audioUrl": "/api/scans/scan_.../audio",
    "aiLabel": "captured"
  }
}
```

`aiLabel` hiện chỉ là nhãn kiểm tra chất lượng tín hiệu, chưa phải chẩn đoán y khoa.

## API Cho Ứng Dụng Android

Các API dưới đây dùng chung prefix `/api`. Sau khi đăng nhập, app gửi header:

```http
Authorization: Bearer <token>
```

### Tài Khoản

```http
POST  /api/auth/login
POST  /api/auth/register
POST  /api/auth/logout
POST  /api/auth/password-reset
GET   /api/me
PATCH /api/me
POST  /api/me/password
```

Tài khoản mẫu để kiểm thử:

```text
Bác sĩ:  bacsytuan@benhvien.com / 12345678
Bệnh nhân: nguyenvana@gmail.com / 12345678
```

### Cài Đặt, Thông Báo, Nhật Ký

```http
GET    /api/settings
PATCH  /api/settings
GET    /api/notifications
POST   /api/notifications/read-all
POST   /api/notifications/:id/read
DELETE /api/notifications/:id
GET    /api/access-logs
```

### Thiết Bị Ống Nghe

```http
GET   /api/devices
GET   /api/devices/scan
POST  /api/devices/pair
PATCH /api/devices/:id
POST  /api/devices/:id/connect
POST  /api/devices/:id/disconnect
POST  /api/devices/:id/calibrate
```

### Trợ Lý AI Và Export

```http
GET   /api/ai/chat
POST  /api/ai/chat
PATCH /api/ai/settings
POST  /api/ai/update
GET   /api/exports
POST  /api/exports
GET   /api/exports/download/:file
```

### Dữ Liệu

```http
GET    /api/data/summary
DELETE /api/data/cache
DELETE /api/data/all
```

Xóa toàn bộ dữ liệu yêu cầu body xác nhận:

```json
{ "confirm": "XOA DU LIEU" }
```

## Tách API Bác Sĩ Và Bệnh Nhân Trong Backend Demo

Backend demo vẫn giữ các endpoint cũ để app hiện tại không bị vỡ, nhưng đã bổ sung prefix riêng để tránh trộn quyền. Các route này dùng được qua cả `/api/...` và `/api/v1/...`:

```http
GET /api/doctor/dashboard
GET /api/doctor/patients
POST /api/doctor/patients
GET /api/doctor/scans
POST /api/doctor/scans/start
```

```http
GET /api/patient/dashboard
GET /api/patient/me
GET /api/patient/scans?limit=50
POST /api/patient/scans/start
GET /api/patient/scans/:id
POST /api/patient/scans/:id/stop
GET /api/patient/scans/:id/audio
```

Quy tắc tạm thời của demo:

- Tài khoản `doctor` xem và quản lý toàn bộ bệnh nhân/lượt đo trong dữ liệu demo.
- Tài khoản `patient` chỉ thấy hồ sơ bệnh nhân được map với tài khoản của chính mình.
- Khi patient start scan, backend bỏ qua `patientId` do app gửi lên và tự dùng patient profile của session hiện tại.
- `POST .../scans/start` hỗ trợ header `Idempotency-Key` để tránh bấm start trùng.
- Đây chưa phải kiến trúc production; bản production cần `/api/v1`, PostgreSQL, organization/membership, doctor-patient access, signed URL, queue AI và audit log bất biến như file `smart-health-android/docs/production_backend_plan.md`.

### Provisioning thiết bị Shcare v1

```http
POST /api/v1/devices/provision-qr
POST /api/v1/devices/pair
POST /api/v1/devices/:id/setup-session
POST /api/v1/devices/:id/release
POST /api/v1/devices/:id/revoke
POST /api/v1/devices/:id/rotate-secret
```

`provision-qr` chỉ dành cho Platform Admin và chỉ tạo claim/setup material cho
một `deviceId` đã được factory-enroll. Browser không được tạo định danh hoặc gửi
`deviceSecret`, hash hay factory credential. Phản hồi một lần chứa cùng
`deviceId + claimCode + expiry` ở receipt và QR, cùng setup AP
`SSID + WPA2_PSK proof-of-possession`; replay ledger không lưu các giá trị
plaintext này.

`pair` yêu cầu `Idempotency-Key`, claim code một lần và `connectionMethod` là
`QR` hoặc `Manual`. `accepted/awaiting_online` chỉ xác nhận backend đã commit
claim. Chỉ `success/online` với `authenticatedTransport=wss` mới có nghĩa thiết
bị đã đăng nhập trực tuyến. `unpair` không được hỗ trợ trong release canonical;
revoke, rotate credential, command và OTA là thao tác Platform Admin có audit.

Ví dụ pair thiết bị bằng claim code:

```json
{
  "deviceId": "stetho-001",
  "claimCode": "A1B2C3D4E5F6",
  "connectionMethod": "Manual"
}
```
