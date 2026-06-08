# Smart Health - Hướng Dẫn Setup Bên Thứ Ba

Last updated: 2026-06-08

Tài liệu này hướng dẫn từng bước để chuyển Smart Health từ chế độ local/demo sang luồng giống sản phẩm thật: Web Admin, Android app và ESP32 đều đi qua backend cloud, Firebase Auth, Postgres, object storage, email/SMS/Zalo và OTA cloud.

Không commit các giá trị sau lên git:

- Firebase service account JSON
- `.env.production`
- Brevo API key hoặc mật khẩu Gmail/App Password fallback
- database URL thật
- S3/R2 access key
- webhook secret
- device secret
- Android signing key

## Tổng Quan Thứ Tự Làm

Làm theo đúng thứ tự này để tránh bị rối:

1. Tạo Firebase project.
2. Tạo Web app và Android app trong Firebase.
3. Tạo Firebase Admin service account cho backend.
4. Chọn nơi deploy backend HTTPS.
5. Tạo Postgres database.
6. Tạo object storage S3/R2.
7. Tạo PHI encryption key.
8. Cấu hình Brevo Email API nếu muốn gửi email thật trên Render Free.
9. Cấu hình SMS/Zalo webhook nếu muốn gửi SMS/Zalo thật.
10. Cấu hình Redis/MQTT nếu cần production nâng cao.
11. Cấu hình Web Admin production build.
12. Cấu hình Android release build.
13. Cấu hình ESP32 firmware lần flash đầu tiên.
14. Chạy production readiness check.

## Bước 1 - Tạo Firebase Project

Mục tiêu: Firebase là nguồn đăng nhập chính cho Web Admin và Android. Backend sẽ dùng Firebase Admin SDK để xác thực token, tạo/xóa user, và set quyền bằng custom claims.

Bạn làm:

1. Mở Firebase Console:

```text
https://console.firebase.google.com/
```

2. Bấm `Add project` hoặc `Create a project`.
3. Đặt tên project, ví dụ:

```text
smart-health-stethoscope
```

4. Project ID nên để cố định và dễ nhớ. Nếu Firebase tự sinh ID khác thì ghi lại chính xác.
5. Google Analytics có thể bật hoặc tắt. Với KLTN, chưa bắt buộc.
6. Chờ Firebase tạo xong project.

Bạn cần ghi lại:

```text
FIREBASE_PROJECT_ID=...
```

Ví dụ hiện dự án đang dùng:

```text
FIREBASE_PROJECT_ID=smart-health-stethoscope
```

Nguồn chính thức: https://firebase.google.com/docs/web/setup

## Bước 2 - Bật Firebase Authentication

Mục tiêu: cho phép đăng nhập bằng email/password.

Bạn làm:

1. Trong Firebase Console, vào project vừa tạo.
2. Vào `Build > Authentication`.
3. Bấm `Get started`.
4. Mở tab `Sign-in method`.
5. Chọn `Email/Password`.
6. Bật `Email/Password`.
7. Lưu lại.

Kết quả đúng:

- Web Admin có thể dùng Firebase email/password login.
- Android app có thể dùng Firebase email/password login.
- Backend có thể verify Firebase ID token.

## Bước 3 - Tạo Firebase Web App Cho Web Admin

Mục tiêu: lấy Firebase web config để Web Admin đăng nhập Firebase.

Bạn làm:

1. Trong Firebase project, vào `Project Overview`.
2. Bấm biểu tượng Web `</>`.
3. App nickname đặt:

```text
Smart Health Web Admin
```

4. Không cần bật Firebase Hosting ở bước này nếu bạn chưa deploy web bằng Firebase Hosting.
5. Bấm `Register app`.
6. Firebase sẽ hiện config dạng:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Bạn cần đưa tôi hoặc điền vào file env của Web Admin các giá trị:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Vị trí thường dùng:

```text
D:\Study\KLTN\smart-health-admin\thiết kế giao diện\.env.production
```

Không commit file `.env.production` nếu có secret/cấu hình thật.

Nguồn chính thức: https://firebase.google.com/docs/web/setup

## Bước 4 - Tạo Firebase Android App

Mục tiêu: lấy `google-services.json` cho Android app.

Bạn làm:

1. Trong Firebase project, vào `Project Overview`.
2. Bấm biểu tượng Android.
3. Firebase hỏi Android package name. Dùng package name hiện tại của app.
4. Nếu chưa chắc package name, mở file:

```text
D:\Study\KLTN\smart-health-android\app\build.gradle.kts
```

Tìm `namespace` hoặc `applicationId`.

5. App nickname đặt:

```text
Smart Health Android
```

6. SHA-1/SHA-256 có thể bỏ qua lúc đầu nếu chỉ dùng email/password. Nếu sau này dùng Google Sign-In/phone auth thì bổ sung.
7. Bấm `Register app`.
8. Tải file:

```text
google-services.json
```

9. Đặt file vào:

```text
D:\Study\KLTN\smart-health-android\app\google-services.json
```

10. Không chia sẻ file này công khai. File này không phải private key server, nhưng vẫn là cấu hình project thật.

Nguồn chính thức: https://firebase.google.com/docs/android/setup

## Bước 5 - Tạo Firebase Admin Service Account Cho Backend

Mục tiêu: backend có quyền verify token, set custom claims, tạo/xóa user Firebase.

Bạn làm:

1. Trong Firebase Console, bấm bánh răng `Project settings`.
2. Vào tab `Service accounts`.
3. Chọn `Firebase Admin SDK`.
4. Bấm `Generate new private key`.
5. Firebase sẽ tải file JSON về máy.
6. Đổi tên file dễ hiểu, ví dụ:

```text
smart-health-stethoscope-firebase-adminsdk.json
```

7. Lưu vào thư mục ngoài git, ví dụ:

```text
D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk.json
```

Bạn cần điền backend env:

```env
AUTH_MODE=production
ALLOW_DEMO_AUTH=false
FIREBASE_AUTH_ENABLED=true
FIREBASE_PROJECT_ID=smart-health-stethoscope
GOOGLE_APPLICATION_CREDENTIALS=D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk.json
```

Khi deploy lên hosting thật, không dùng path Windows. Dùng secret manager hoặc biến:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Nguồn chính thức: https://firebase.google.com/docs/admin/setup

## Bước 6 - Tạo Tài Khoản Admin Đầu Tiên

Mục tiêu: có tài khoản quản trị toàn hệ thống để đăng nhập Web Admin.

Cách đơn giản:

1. Firebase Console > `Authentication > Users`.
2. Bấm `Add user`.
3. Nhập email của bạn.
4. Nhập password mạnh.
5. Tạo user.
6. Copy UID của user đó.

Sau đó chạy lệnh set custom claims:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk.json"
npm.cmd run firebase:claims -- <UID> admin org_default_clinic
```

Thay `<UID>` bằng UID thật copy từ Firebase.

Nếu muốn tạo admin bệnh viện:

```powershell
npm.cmd run firebase:claims -- <UID> workspace_admin <workspaceId>
```

Sau khi set claims, người dùng phải đăng xuất rồi đăng nhập lại để token mới nhận quyền.

Nguồn chính thức về verify token/custom backend: https://firebase.google.com/docs/auth/admin/verify-id-tokens

## Bước 7 - Chọn Nơi Deploy Backend HTTPS

Mục tiêu: backend phải có URL HTTPS public để Web Admin, Android và ESP32 đều gọi được dù không cùng mạng WiFi.

Bạn có thể chọn một trong các hướng:

| Lựa chọn | Dễ dùng | Ghi chú |
| --- | --- | --- |
| Render | Dễ | Phù hợp demo/KLTN, có Node.js web service |
| Railway | Dễ | Có Postgres/Redis kèm theo |
| Fly.io | Trung bình | Tốt hơn nếu cần region/scale |
| VPS riêng | Khó hơn | Chủ động nhất nhưng phải tự cài SSL/reverse proxy |

Tôi khuyên dùng một trong hai cách:

- Dễ nhất: `Render + Neon Postgres + Cloudflare R2`.
- Gọn hơn: `Railway backend + Railway Postgres + Cloudflare R2`.

Backend cần có domain dạng:

```text
https://api.smart-health.example.com
```

Không dùng production với:

```text
http://localhost:3000
http://127.0.0.1:3000
http://192.168.x.x
http://smarthealth-xxxx.local
```

Backend env cần:

```env
PUBLIC_BACKEND_URL=https://api.smart-health.example.com
SMART_HEALTH_PUBLIC_URL=https://api.smart-health.example.com
PUBLIC_API_BASE_URL=https://api.smart-health.example.com/api/v1
CORS_ORIGIN=https://admin.smart-health.example.com
PORT=3000
```

Nếu chưa có domain riêng, dùng URL HTTPS mà hosting cấp tạm cũng được, ví dụ:

```text
https://smart-health-api.onrender.com
```

## Bước 8 - Tạo Postgres Database

Mục tiêu: production không dùng JSON file local nữa. Dữ liệu user, bệnh viện, bệnh nhân, thiết bị, scan, audit phải nằm ở database thật.

Tôi khuyên dùng Neon vì nhanh và có free tier.

Bạn làm với Neon:

1. Mở:

```text
https://neon.com/
```

2. Đăng ký/đăng nhập.
3. Tạo project mới, ví dụ:

```text
smart-health-production
```

4. Chọn region gần Việt Nam/Singapore nếu có.
5. Tạo database mặc định.
6. Bấm `Connect`.
7. Copy connection string dạng:

```text
postgresql://user:password@host/dbname?sslmode=require
```

Backend env:

```env
DATA_BACKEND=postgres
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

Sau khi điền env, chạy migration:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run migrate
npm.cmd run smoke:postgres
```

Nguồn chính thức: https://neon.com/docs/get-started-with-neon/connect-neon

## Bước 9 - Tạo Object Storage S3/R2

Mục tiêu: lưu file thật: audio scan, avatar, logo, export, backup, firmware `.bin`.

Tôi khuyên dùng Cloudflare R2 vì S3-compatible và dễ dùng.

Bạn làm:

1. Mở Cloudflare Dashboard:

```text
https://dash.cloudflare.com/
```

2. Vào `R2 Object Storage`.
3. Nếu Cloudflare yêu cầu enable/purchase R2 thì bật theo hướng dẫn.
4. Tạo bucket, ví dụ:

```text
smart-health-production
```

5. Vào R2 > `Manage API Tokens`.
6. Tạo R2 API token hoặc S3 API token.
7. Cấp quyền đọc/ghi cho bucket `smart-health-production`.
8. Copy:

```text
Access Key ID
Secret Access Key
Account ID
Endpoint
```

Backend env:

```env
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_BUCKET=smart-health-production
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=<access-key-id>
S3_SECRET_ACCESS_KEY=<secret-access-key>
```

Kiểm tra:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:storage
```

Bucket này sẽ dùng cho:

- `avatars`
- `device-firmware`
- audio scans
- logo
- exports
- backups

Nguồn chính thức:

- R2 S3 API: https://developers.cloudflare.com/r2/api/s3/
- R2 tokens: https://developers.cloudflare.com/r2/api/tokens/

## Bước 10 - Tạo PHI Encryption Key

Mục tiêu: có secret để mã hóa/bao bọc dữ liệu nhạy cảm.

Trên PowerShell chạy:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes)
```

Lệnh sẽ in ra chuỗi 64 ký tự hex. Copy chuỗi đó vào backend env:

```env
PHI_ENCRYPTION_KEY=<chuỗi-64-ký-tự-hex>
```

Không gửi key này vào chat công khai, không commit vào git.

## Bước 11 - Cấu Hình Brevo Email API Để Gửi Email Thật

Mục tiêu: nút test email trong Settings gửi email thật bằng HTTPS API, chạy được trên Render Free.

Render Free chặn outbound SMTP port `25`, `465`, `587`, nên Gmail SMTP không phải hướng chính. Dùng Brevo Transactional Email API cho bản miễn phí/demo.

Các bước:

1. Tạo tài khoản tại `https://www.brevo.com/`.
2. Vào phần Transactional hoặc SMTP & API.
3. Tạo API key v3.
4. Xác minh sender/domain. Nếu chưa có domain riêng, có thể xác minh email cá nhân cho demo.

Backend env:

```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<brevo-api-key>
BREVO_FROM_EMAIL=<verified-sender@example.com>
BREVO_FROM_NAME=Smart Health
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
WEB_ADMIN_URL=https://shcare-admin.web.app
NOTIFICATION_EMAIL_ENABLED=true
```

Khi Brevo đã cấu hình, backend sẽ dùng cùng kênh email này để gửi mọi thông báo Web Admin tới các quản trị viên toàn hệ thống đang hoạt động. `WEB_ADMIN_URL` dùng cho nút mở trang thông báo trong email. `NOTIFICATION_EMAIL_ENABLED=false` chỉ dùng như công tắc tắt khẩn cấp.

SMTP/Gmail vẫn có trong code nhưng chỉ là fallback cho hosting trả phí hoặc local demo có mở SMTP:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=<gmail-app-password>
SMTP_FROM="Smart Health <your-gmail@gmail.com>"
```

Test bằng Web Admin:

1. Đăng nhập Platform Admin.
2. Vào `Settings`.
3. Mở phần outbound/email.
4. Nhập email nhận test.
5. Bấm `Test email`.

Hoặc test bằng API:

```powershell
$body=@{to='your-test-email@example.com'} | ConvertTo-Json
Invoke-RestMethod https://api.smart-health.example.com/api/settings/test-email -Method POST -ContentType 'application/json' -Body $body
```

Nguồn chính thức:

- Render SMTP block on Free services: https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
- Brevo transactional email API: https://developers.brevo.com/docs/send-a-transactional-email
- Brevo Free plan limit: https://help.brevo.com/hc/en-us/articles/208580669-What-are-the-limits-of-the-Free-plans-
- Gmail App Passwords fallback: https://support.google.com/accounts/answer/185833

## Bước 12 - Cấu Hình SMS/Zalo

Mục tiêu: backend gửi được SMS/Zalo qua webhook/provider thật.

Không có kênh SMS/Zalo production miễn phí ổn định giống email Brevo. SMS thật thường tính phí theo tin nhắn hoặc chỉ có trial nhỏ; Zalo OA/ZNS có bảng giá, quy định template và xét duyệt. Hiện code Smart Health hỗ trợ cách an toàn nhất cho bản miễn phí/demo: backend POST payload sang webhook do bạn cấu hình. Webhook đó có thể là:

- server riêng của bạn,
- Make/Zapier/n8n webhook,
- SMS provider relay,
- Zalo OA relay.

Backend env:

```env
OUTBOUND_WEBHOOK_URL=https://your-provider-or-relay.example.com/smart-health/outbound
OUTBOUND_WEBHOOK_SECRET=<shared-secret>
```

Payload backend gửi:

```json
{
  "channel": "sms",
  "to": "0900000000",
  "message": "Smart Health notification",
  "templateId": "optional-template",
  "metadata": {}
}
```

Với Zalo OA production:

1. Tạo tài khoản Zalo Developers.
2. Tạo app hoặc liên kết Official Account.
3. Hoàn tất xác thực OA nếu Zalo yêu cầu.
4. Tạo template/tin nhắn theo chính sách Zalo.
5. Lấy access token theo luồng Zalo yêu cầu.
6. Tạo webhook relay của mình để nhận payload từ Smart Health rồi gọi Zalo OpenAPI.
7. Điền URL relay vào `OUTBOUND_WEBHOOK_URL`.

Nguồn chính thức: https://developers.zalo.me/docs

Ghi chú: tôi chưa hardcode eSMS/Zalo token vào source vì mỗi tài khoản/provider có API key riêng và có thể mất phí. Direct adapter cho SpeedSMS/eSMS/VietGuys/Zalo OA/ZNS nên đưa vào hướng phát triển sau khi có tài khoản/token thật.

## Bước 13 - Cấu Hình Redis

Mục tiêu: chuẩn bị cho queue, worker AI/audio, realtime scale nhiều instance.

Nếu dùng Railway/Render/Upstash:

1. Tạo Redis instance.
2. Copy Redis URL.
3. Điền backend env:

```env
REDIS_URL=rediss://:<password>@<host>:6379
```

Nếu provider chỉ đưa `redis://` nội bộ thì chỉ dùng được khi backend cùng private network. Public production nên ưu tiên TLS `rediss://`.

Hiện Redis là khuyến nghị production, chưa phải chặn cứng cho KLTN demo.

## Bước 14 - Cấu Hình MQTT Nếu Muốn Tách Control Plane

Mục tiêu: dùng MQTT/TLS cho telemetry, command, OTA events. Không dùng MQTT để stream audio dài.

Nếu dùng HiveMQ Cloud/EMQX Cloud:

1. Tạo cluster MQTT cloud.
2. Bật TLS.
3. Tạo username/password.
4. Copy broker URL.

Backend env:

```env
MQTT_URL=mqtts://<broker-host>:8883
MQTT_USERNAME=<username>
MQTT_PASSWORD=<password>
MQTT_CLIENT_ID=smart-health-backend
```

Smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:mqtt
```

Ghi chú: hiện ESP đã có luồng WebSocket/WSS outbound đến backend, nên MQTT là nâng cấp tùy chọn, không bắt buộc ngay.

## Bước 15 - Cấu Hình Web Admin Production

Mục tiêu: Web Admin build ra bản thật, trỏ tới backend HTTPS, không còn local.

Tạo hoặc cập nhật file:

```text
D:\Study\KLTN\smart-health-admin\thiết kế giao diện\.env.production
```

Nội dung mẫu:

```env
VITE_AUTH_MODE=production
VITE_SMART_HEALTH_BASE_URL=https://api.smart-health.example.com
VITE_SMART_HEALTH_API_BASE_URL=https://api.smart-health.example.com/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=smart-health-stethoscope
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Build:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build:product
```

Nếu command fail vì URL local hoặc không HTTPS thì đúng. Phải sửa env sang domain thật.

## Bước 16 - Cấu Hình Android Release

Mục tiêu: APK release gọi backend HTTPS thật.

Đảm bảo file này đã có:

```text
D:\Study\KLTN\smart-health-android\app\google-services.json
```

Build release:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com
```

Nếu thiếu `SMART_HEALTH_BASE_URL`, build release sẽ fail. Đây là guard cố ý để tránh phát hành app còn trỏ localhost.

Sau này khi phát hành thật cần thêm:

- Android keystore
- key alias
- key password
- store password
- Play Console nếu upload lên Google Play

## Bước 17 - Cấu Hình ESP32 Lần Flash Đầu Tiên

Mục tiêu: ESP32 có firmware ban đầu để sau đó tự kết nối WiFi, gửi heartbeat/audio, nhận lệnh cloud OTA.

Lưu ý quan trọng:

- ESP32 trắng hoàn toàn vẫn cần cắm dây flash lần đầu.
- Sau khi đã có firmware cloud OTA, các lần update sau có thể làm qua Web Admin nếu thiết bị online.
- Không đưa WiFi thật/device secret thật lên git.

Build flags cần có lúc flash đầu:

```ini
build_flags =
  -DSMART_HEALTH_WIFI_SSID=\"YourWiFi\"
  -DSMART_HEALTH_WIFI_PASS=\"YourPassword\"
  -DSMART_HEALTH_BACKEND_HOST=\"api.smart-health.example.com\"
  -DSMART_HEALTH_BACKEND_PORT=443
  -DSMART_HEALTH_BACKEND_TLS=1
  -DSMART_HEALTH_DEVICE_ID=\"smarthealth-ABCDEF\"
  -DSMART_HEALTH_DEVICE_SECRET=\"device-secret-issued-by-web-admin\"
  -DSMART_HEALTH_FIRMWARE_VERSION=\"1.0.0\"
```

Build firmware:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
```

Flash khi thấy COM port:

```powershell
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device list
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run --target upload --upload-port COM6
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device monitor --port COM6 --baud 115200
```

Nếu WiFi sai hoặc đổi mạng:

1. ESP phát AP `SmartHealth-xxxxxx`.
2. Dùng điện thoại/laptop kết nối AP đó.
3. Mở:

```text
http://192.168.4.1
```

4. Nhập SSID/password WiFi mới.
5. ESP restart và quay lại cloud.

Local portal chỉ dùng đổi WiFi. Không cho đổi OTA password, backend host, device secret hay firmware.

## Bước 18 - Cloud OTA Qua Web Admin

Mục tiêu: update firmware qua Internet, không cần cùng WiFi.

Bạn làm:

1. Build firmware `.bin`:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
```

File firmware nằm ở:

```text
D:\Study\KLTN\smart-health-embedded\MSM261S4030H0\.pio\build\esp32-s3-devkitm-1\firmware.bin
```

2. Vào Web Admin > Storage.
3. Upload `.bin` vào bucket:

```text
device-firmware
```

4. Vào Web Admin > Devices.
5. Chọn thiết bị.
6. Chọn firmware vừa upload.
7. Backend tự lấy checksum/version nếu metadata có đủ.
8. Gửi OTA.
9. ESP nhận lệnh qua backend cloud, tải firmware HTTPS, verify SHA-256, ghi OTA partition, reboot.

Điều kiện bắt buộc:

- ESP đang online Internet.
- Backend có public HTTPS URL.
- Firmware file tải được từ backend/storage.
- Device secret hợp lệ.

## Bước 19 - Chạy Production Readiness Check

Sau khi điền env thật, chạy:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run check:production
```

Nếu muốn kiểm tra kiểu deploy gate:

```powershell
npm.cmd run check:production:strict
```

`check:production` có thể báo `BLOCKED` nếu thiếu:

- `AUTH_MODE=production`
- Firebase Admin service account
- HTTPS backend URL
- Postgres URL
- S3/R2 credentials
- `PHI_ENCRYPTION_KEY`
- Cloud OTA public URL

Khi mọi mục required pass, mới tính là sẵn sàng smoke production.

## Bước 20 - Bạn Cần Chuẩn Bị Gì Rồi Gửi Tôi

Bạn không nên gửi secret trực tiếp vào chat nếu không cần. Nhưng khi bạn setup xong, bạn có thể báo cho tôi các thông tin không nhạy cảm và đường dẫn file local:

Firebase:

```text
FIREBASE_PROJECT_ID=...
Đường dẫn service account JSON trên máy: D:\Study\KLTN\firebase\...
Web app config đã điền vào .env.production: có/chưa
Android google-services.json đã đặt vào app/: có/chưa
```

Backend:

```text
Backend HTTPS URL: https://...
Hosting dùng: Render/Railway/Fly/VPS/khác
```

Database:

```text
Provider: Neon/Supabase/Railway/khác
DATABASE_URL đã điền vào env hosting: có/chưa
```

Storage:

```text
Provider: Cloudflare R2/AWS S3/khác
Bucket name: ...
Env S3 đã điền vào hosting: có/chưa
```

Outbound:

```text
Brevo email API đã cấu hình: có/chưa
SMTP fallback đã cấu hình nếu cần: có/chưa
SMS/Zalo webhook đã cấu hình: có/chưa
```

ESP:

```text
ESP32 đã cắm máy: có/chưa
COM port: COM...
Backend host cho firmware: ...
Device ID: ...
```

Sau khi bạn chuẩn bị xong các mục trên, tôi có thể chạy tiếp:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check:production:strict
npm.cmd run smoke:workspace-access
npm.cmd run smoke:storage
```

Rồi build:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build:product
```

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com
```

## Tài Liệu Chính Thức Đã Đối Chiếu

- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Firebase ID token verification: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Firebase Web setup: https://firebase.google.com/docs/web/setup
- Firebase Android setup: https://firebase.google.com/docs/android/setup
- Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/api/s3/
- Cloudflare R2 API tokens: https://developers.cloudflare.com/r2/api/tokens/
- Render SMTP block on Free services: https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
- Brevo transactional email API: https://developers.brevo.com/docs/send-a-transactional-email
- Brevo Free plan limits: https://help.brevo.com/hc/en-us/articles/208580669-What-are-the-limits-of-the-Free-plans-
- Google App Passwords fallback: https://support.google.com/accounts/answer/185833
- Zalo Developers: https://developers.zalo.me/docs
- Neon Postgres connection strings: https://neon.com/docs/get-started-with-neon/connect-neon
