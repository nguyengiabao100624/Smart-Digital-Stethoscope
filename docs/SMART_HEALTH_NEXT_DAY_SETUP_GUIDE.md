# Smart Health - Hướng Dẫn Setup Ngày Mai

Last updated: 2026-06-08

Tài liệu này dùng cho buổi setup tiếp theo sau khi code đã được push lên GitHub. Mục tiêu là đưa hệ thống vào trạng thái có thể demo thực tế: Web Admin chạy trên Firebase Hosting, backend chạy trên Render, database và object storage dùng Supabase, đăng nhập dùng Firebase Auth, Android trỏ về backend HTTPS, và ESP32-S3 có thể kết nối cloud để gửi trạng thái, audio và nhận lệnh OTA.

## Nguyên Tắc Trước Khi Làm

- Không commit secret lên GitHub: `.env.production`, `.env.local`, Firebase service account JSON, `google-services.json`, device secret, SMTP password, Supabase password.
- Các giá trị bí mật chỉ đặt trong Render Environment, GitHub Actions Secrets, Firebase Console hoặc file local đã bị `.gitignore`.
- Nếu lệnh nào yêu cầu secret, chạy trên máy local của bạn hoặc nhập vào dashboard của dịch vụ, không ghi vào source.
- Web Admin production hiện tại: `https://shcare-admin.web.app`.
- Web app cho người dùng/app Android dạng web sau này: `https://shcare.web.app`.
- Backend Render hiện tại: `https://smart-health-api-xj0a.onrender.com`.
- Supabase project ref đang dùng: `mahvymyncxszvuhlycwp`.
- Nếu thấy giao diện cũ sau khi deploy, dùng `Ctrl+F5` hoặc mở trình duyệt ẩn danh để loại cache.

## Bước 1 - Lấy Code Mới Nhất

Mở PowerShell:

```powershell
cd D:\Study\KLTN
git pull origin main
```

Kiểm tra trạng thái file:

```powershell
git status --short
```

Nếu thấy nhiều file local chưa commit mà bạn không chắc là gì, cứ để nguyên. Không chạy `git reset --hard`, không xóa hàng loạt, không checkout đè file nếu chưa hỏi lại.

## Bước 2 - Kiểm Tra GitHub Actions

Mở trang Actions của repo:

```text
https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions
```

Bạn cần thấy workflow `Smart Health CI`.

Workflow này tự kiểm tra:

- Backend `npm run check`.
- Backend workspace access smoke.
- Backend production readiness report.
- Web Admin Firebase build.
- Android debug Kotlin compile.
- Firmware ESP32-S3 bản thường.
- Firmware ESP32-S3 bản OTA.

Nếu workflow màu xanh là ổn. Nếu workflow màu đỏ, mở run bị lỗi, mở job bị lỗi, copy log lỗi gửi lại để sửa tiếp.

Nếu bạn thấy lỗi kiểu `Installed versions ... No file ... requirements.txt or pyproject.toml`, đó thường là lỗi của run cũ hoặc job cache sai. Chỉ cần kiểm tra run mới nhất: nếu các job mới đều xanh thì bỏ qua run đỏ cũ.

## Bước 3 - Cấu Hình GitHub Secrets Nếu Muốn Deploy Web Admin Từ GitHub

Bước này không bắt buộc nếu bạn muốn deploy Firebase từ máy local. Nhưng nếu muốn bấm deploy ngay trên GitHub thì làm như sau.

Vào:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Tạo các secret:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
VITE_FIREBASE_API_KEY
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Ý nghĩa từng secret:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: toàn bộ nội dung file service account JSON dùng để Firebase Hosting deploy.
- `VITE_FIREBASE_API_KEY`: lấy trong Firebase Console, Web App config.
- `VITE_FIREBASE_MESSAGING_SENDER_ID`: lấy trong Firebase Console, Web App config.
- `VITE_FIREBASE_APP_ID`: lấy trong Firebase Console, Web App config.
- `VITE_FIREBASE_MEASUREMENT_ID`: nếu Firebase Web App có Analytics thì nhập, nếu không có thì có thể bỏ qua.

Sau khi thêm secret, deploy bằng GitHub:

```text
GitHub repo -> Actions -> Deploy Web Admin -> Run workflow
```

Nếu workflow báo thiếu secret, quay lại phần Secrets và thêm đúng secret còn thiếu.

## Bước 4 - Kiểm Tra Render Backend Environment

Vào Render service backend `smart-health-api-xj0a`, mở tab `Environment`.

Các biến bắt buộc nên có:

```env
AUTH_MODE=production
ALLOW_DEMO_AUTH=false
FIREBASE_AUTH_ENABLED=true
FIREBASE_PROJECT_ID=smart-health-stethoscope
FIREBASE_SERVICE_ACCOUNT_JSON=<dán toàn bộ service account JSON>
DATA_BACKEND=postgres
DATABASE_URL=<Supabase pooler connection string, không dùng direct IPv6>
PUBLIC_BACKEND_URL=https://smart-health-api-xj0a.onrender.com
SMART_HEALTH_PUBLIC_URL=https://smart-health-api-xj0a.onrender.com
PUBLIC_API_BASE_URL=https://smart-health-api-xj0a.onrender.com/api/v1
CORS_ORIGIN=https://shcare-admin.web.app,https://shcare.web.app
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_BUCKET=smart-health-production
S3_ENDPOINT=https://mahvymyncxszvuhlycwp.storage.supabase.co/storage/v1/s3
S3_REGION=ap-northeast-2
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=<Supabase Storage access key id>
S3_SECRET_ACCESS_KEY=<Supabase Storage secret access key>
PHI_ENCRYPTION_KEY=<chuỗi hex 64 ký tự>
RATE_LIMIT_PER_MINUTE=300
```

Các biến tùy chọn, chưa có thì hệ thống vẫn chạy nhưng tính năng tương ứng chưa gửi thật:

```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<Brevo API key>
BREVO_FROM_EMAIL=<email gửi đi đã xác minh trong Brevo>
BREVO_FROM_NAME=Smart Health
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
```

SMTP/Gmail chỉ là fallback nếu hosting cho phép SMTP. Render Free đang chặn các cổng SMTP phổ biến, nên không dùng Gmail SMTP làm hướng chính:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail của bạn>
SMTP_PASS=<Gmail App Password>
SMTP_FROM=Smart Health <gmail của bạn>
OUTBOUND_WEBHOOK_URL=
OUTBOUND_WEBHOOK_SECRET=
REDIS_URL=
MQTT_URL=
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_CLIENT_ID=smart-health-backend
```

Tạo `PHI_ENCRYPTION_KEY` bằng PowerShell tương thích máy cũ:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
-join ($bytes | ForEach-Object { $_.ToString("x2") })
```

Sau khi sửa env trên Render:

1. Bấm `Save Changes`.
2. Bấm `Manual Deploy`.
3. Chờ deploy xong.
4. Mở health check:

```powershell
Invoke-RestMethod https://smart-health-api-xj0a.onrender.com/api/health
```

Kết quả đúng cần có:

```json
{
  "ok": true,
  "service": "smart-health-backend"
}
```

## Bước 5 - Chạy Kiểm Tra Production Từ Máy Local

Không cần Render Shell trả phí. Bạn có thể chạy các script từ máy local.

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run smoke:public-deployment
```

`smoke:public-deployment` kiểm tra:

- Render `/api/health` trả 200.
- `/api/me` khi chưa đăng nhập phải trả 401.
- Firebase Hosting `/login` trả được Web Admin shell.
- Firebase Hosting `/admin-actions` rewrite đúng về Web Admin shell.

Nếu bạn đã set đủ env Firebase/Supabase/S3 ở PowerShell local thì chạy thêm:

```powershell
npm.cmd run smoke:storage
npm.cmd run smoke:production-roles
```

Trước khi chạy `smoke:production-roles`, cần set Firebase Admin local:

```powershell
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
npm.cmd run smoke:production-roles
```

Nếu chỉ kiểm tra checklist triển khai:

```powershell
npm.cmd run check:production
```

Nếu chạy local mà báo `BLOCKED` do thiếu env production thì không sao. Quan trọng là Render đã được set env đúng.

## Bước 6 - Deploy Lại Web Admin Firebase Hosting Từ Máy Local

Nếu chưa đăng nhập Firebase CLI:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npx.cmd firebase-tools login
```

Build bản Firebase Hosting:

```powershell
npm.cmd run build:firebase
```

Deploy lên site admin:

```powershell
npx.cmd firebase-tools deploy --only hosting:admin --project smart-health-stethoscope
```

Mở:

```text
https://shcare-admin.web.app
```

Kỳ vọng sau deploy:

- Nếu chưa đăng nhập: tự chuyển về `/login`.
- Nếu đã có session Firebase admin: vào dashboard.
- Sidebar có mục `Hành động quản trị`.
- Admin toàn hệ thống thấy `Quản trị toàn hệ thống` và `Nền tảng: Toàn hệ thống`.
- Admin bệnh viện thấy workspace/bệnh viện của họ, không thấy menu platform-only.

Nếu vẫn thấy bản cũ:

1. Bấm `Ctrl+F5`.
2. Hoặc mở tab ẩn danh.
3. Hoặc chờ 1-2 phút rồi thử lại.

## Bước 7 - Tạo Tài Khoản Admin Ngay Trên Web Admin

Đăng nhập bằng tài khoản admin toàn hệ thống.

Vào:

```text
Hành động quản trị -> Tạo tài khoản admin
```

Chọn loại tài khoản:

- `Admin toàn hệ thống`: quản lý platform, gói dịch vụ, workspace, thiết bị, cấu hình hệ thống.
- `Admin bệnh viện`: chỉ quản lý dữ liệu của một bệnh viện/workspace được chọn.

Nhập thông tin:

- Họ tên.
- Email.
- Số điện thoại nếu có.
- Mật khẩu tạm thời tối thiểu 8 ký tự.
- Workspace nếu tạo admin bệnh viện.

Sau khi tạo xong:

1. Đăng xuất tài khoản hiện tại nếu muốn test.
2. Đăng nhập bằng email/mật khẩu vừa tạo.
3. Kiểm tra quyền hiển thị có đúng không.

Kỳ vọng:

- Admin toàn hệ thống thấy các mục quản trị platform.
- Admin bệnh viện không thấy quản lý gói toàn hệ thống, duyệt bác sĩ toàn hệ thống hoặc quản lý workspace khác.

## Bước 8 - Cấu Hình Email Miễn Phí Bằng Brevo API

Render Free chặn outbound SMTP port `25`, `465`, `587`, nên Gmail SMTP dễ bị treo hoặc timeout dù App Password đúng. Hướng nên dùng cho bản miễn phí là Brevo Transactional Email API vì backend gọi qua HTTPS.

Brevo Free hiện phù hợp demo KLTN vì có gói miễn phí 300 email/ngày. Cách làm:

1. Vào `https://www.brevo.com/` và tạo tài khoản miễn phí.
2. Vào phần Transactional hoặc SMTP & API.
3. Tạo API key v3.
4. Vào phần sender/domain và xác minh email gửi đi. Nếu chưa có domain riêng, dùng chính Gmail cá nhân làm sender đã xác minh cũng được cho demo.
5. Trên Render -> service backend `smart-health-api` -> Environment, đặt:

```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<Brevo API key>
BREVO_FROM_EMAIL=<email đã xác minh trong Brevo>
BREVO_FROM_NAME=Smart Health
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
```

6. Bấm `Save Changes` để Render redeploy backend.
7. Vào Web Admin:

```text
Cài đặt -> Thông báo/Outbound -> Email thông báo / Brevo API -> Gửi email kiểm tra
```

Nếu thiếu env, Web Admin sẽ báo thiếu `BREVO_API_KEY` hoặc `BREVO_FROM_EMAIL`. Nếu Brevo báo lỗi sender/from, hãy kiểm tra lại email gửi đi đã được xác minh trong Brevo chưa.

Gmail SMTP vẫn được giữ trong code làm fallback cho hosting trả phí hoặc chạy local. Chỉ dùng fallback này khi bạn chắc chắn server cho phép SMTP:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail của bạn>
SMTP_PASS=<Gmail App Password>
SMTP_FROM=Smart Health <gmail của bạn>
```

Với Gmail fallback, `SMTP_FROM` nên trùng `SMTP_USER`; `SMTP_PASS` là Gmail App Password 16 ký tự, không phải mật khẩu Gmail thường.

## Bước 9 - SMS/Zalo

Không có kênh SMS/Zalo production miễn phí ổn định giống Brevo email. SMS thật thường tính tiền theo tin nhắn hoặc chỉ cho trial rất ít. Zalo OA/ZNS là dịch vụ chính thức có bảng giá/quy định mẫu tin, không nên xem là miễn phí cho sản phẩm thật.

Bản hiện tại giữ đường webhook tự cấu hình để có thể cắm provider/trial sau này mà không sửa lại Web Admin:

Nếu chưa cần demo SMS/Zalo thật, để trống:

```env
OUTBOUND_WEBHOOK_URL=
OUTBOUND_WEBHOOK_SECRET=
```

Nếu có webhook trung gian hoặc provider:

```env
OUTBOUND_WEBHOOK_URL=https://your-webhook.example/smart-health/outbound
OUTBOUND_WEBHOOK_SECRET=<shared secret>
```

Backend sẽ POST payload dạng:

```json
{
  "channel": "sms",
  "to": "0900000000",
  "message": "Smart Health test",
  "templateId": "...",
  "metadata": {}
}
```

Zalo cũng đi theo cùng flow webhook, chỉ đổi `channel` thành `zalo`.

Hướng phát triển sau báo cáo KLTN: nếu có tài khoản nhà cung cấp thật, thêm adapter trực tiếp cho SpeedSMS/eSMS/VietGuys hoặc Zalo OA/ZNS, kèm quản lý template, trạng thái gửi, chi phí theo workspace và retry.

## Bước 10 - Android Build Để Cài Lên Điện Thoại Hoặc Emulator

Build debug cho emulator:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleDebug
```

APK debug nằm ở:

```text
D:\Study\KLTN\smart-health-android\app\build\outputs\apk\debug\app-debug.apk
```

Build release trỏ về backend Render:

```powershell
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://smart-health-api-xj0a.onrender.com
```

Nếu release fail vì thiếu signing config thì đó là phần ký APK. Khi cần phát hành thật, tạo keystore riêng và không commit keystore lên GitHub.

## Bước 11 - ESP32-S3 Lần Đầu

Lần đầu vẫn cần cắm dây để nạp firmware có khả năng cloud/OTA. Sau khi đã có firmware này, các lần sau có thể OTA qua cloud nếu thiết bị online.

Kiểm tra cổng COM:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device list
```

Nếu thấy ESP32-S3 ở COM6 hoặc COM khác, dùng đúng cổng đó.

Tạm thời thêm build flags local để flash. Không commit secret này:

```ini
build_flags =
  -DSMART_HEALTH_WIFI_SSID=\"TenWiFi\"
  -DSMART_HEALTH_WIFI_PASS=\"MatKhauWiFi\"
  -DSMART_HEALTH_BACKEND_HOST=\"smart-health-api-xj0a.onrender.com\"
  -DSMART_HEALTH_BACKEND_PORT=443
  -DSMART_HEALTH_BACKEND_TLS=1
  -DSMART_HEALTH_DEVICE_ID=\"smarthealth-ABCDEF\"
  -DSMART_HEALTH_DEVICE_SECRET=\"device-secret-issued-by-web-admin\"
  -DSMART_HEALTH_FIRMWARE_VERSION=\"1.0.0\"
```

Build và upload:

```powershell
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1 --target upload --upload-port COM6
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device monitor --port COM6 --baud 115200
```

Nếu thiết bị mất WiFi hoặc chưa có WiFi:

1. ESP phát AP `SmartHealth-xxxxxx`.
2. Dùng điện thoại/laptop kết nối AP đó.
3. Mở trình duyệt:

```text
http://192.168.4.1
```

Trang local chỉ dùng để đổi WiFi. Không đổi OTA password, backend host, device secret, quyền admin hoặc firmware tại trang local. Tất cả quản lý thiết bị làm trên Web Admin chính.

## Bước 12 - Cloud OTA Không Cần Cùng Mạng

Build firmware `.bin`:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
```

File firmware nằm ở:

```text
D:\Study\KLTN\smart-health-embedded\MSM261S4030H0\.pio\build\esp32-s3-devkitm-1\firmware.bin
```

Trên Web Admin:

```text
Storage -> bucket device-firmware -> upload firmware.bin
Devices -> chọn device -> OTA -> chọn file firmware -> gửi lệnh OTA
```

Luồng đúng:

1. Web Admin upload firmware lên storage.
2. Backend tạo URL tải firmware có token.
3. Backend gửi lệnh OTA cho ESP qua kết nối cloud.
4. ESP tải firmware qua HTTPS.
5. ESP kiểm tra SHA-256.
6. ESP ghi OTA partition.
7. ESP reboot.
8. Web Admin thấy trạng thái OTA cập nhật.

ESP chỉ cần có Internet. Máy tính và ESP không cần cùng WiFi.

## Bước 13 - Smoke Cuối Trước Khi Báo Cáo

Chạy smoke public không cần secret:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run smoke:public-deployment
```

Checklist Web Admin:

- `https://smart-health-api-xj0a.onrender.com/api/health` trả `ok: true`.
- `https://shcare-admin.web.app` chưa đăng nhập thì tự về login.
- Platform admin vào đúng giao diện quản trị toàn hệ thống.
- Platform admin thấy `Nền tảng: Toàn hệ thống`, không còn `Smart Health Clinic` ở topbar/sidebar.
- Sidebar có `Hành động quản trị`.
- Tạo được admin bệnh viện mới ngay trên Web Admin.
- Admin bệnh viện chỉ thấy dữ liệu bệnh viện của mình.
- Avatar upload thành công.
- Logo upload thành công.
- Settings save thành công.
- Storage upload/download thành công.

Checklist Android:

- App build được.
- App đăng nhập được bằng Firebase.
- App gọi backend HTTPS được.
- Dashboard không trỏ về localhost/emulator trong bản release.

Checklist ESP32-S3:

- Flash lần đầu thành công.
- Serial monitor thấy WiFi kết nối thành công.
- Web Admin thấy device online.
- ESP gửi heartbeat, WiFi RSSI/IP, firmware version.
- Realtime audio đi qua backend.
- Cloud OTA gửi từ Web Admin, ESP tải firmware và reboot.

Nếu có lỗi:

1. Ghi rõ đang làm ở bước nào.
2. Chụp màn hình lỗi.
3. Copy log PowerShell/Render/GitHub Actions/Serial Monitor.
4. Gửi lại để sửa tiếp đúng điểm lỗi.
