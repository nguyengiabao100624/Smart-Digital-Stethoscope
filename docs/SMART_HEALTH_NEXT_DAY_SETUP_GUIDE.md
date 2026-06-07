# Smart Health - Huong Dan Setup Ngay Mai

Last updated: 2026-06-08

Tai lieu nay dung cho buoi setup tiep theo sau khi code da duoc push. Muc tieu la dua he thong vao trang thai demo thuc te: Web Admin tren Firebase Hosting, backend tren Render, database va storage tren Supabase, Firebase Auth that, Android tro ve backend HTTPS, va ESP32-S3 co the ket noi cloud.

## Nguyen Tac

- Khong commit secret len GitHub: `.env.production`, `.env.local`, Firebase service account JSON, `google-services.json`, device secret, SMTP password.
- Neu can chay lenh co secret, chay local PowerShell hoac dat vao Render/Firebase secret/env.
- Web Admin production: `https://shcare-admin.web.app`.
- Web app nguoi dung tuong lai: `https://shcare.web.app`.
- Backend Render hien tai: `https://smart-health-api-xj0a.onrender.com`.
- Supabase project ref dung: `mahvymyncxszvuhlycwp`.

## Buoc 1 - Lay Code Moi Nhat

```powershell
cd D:\Study\KLTN
git pull origin main
```

Kiem tra nhanh:

```powershell
git status --short
```

Neu thay nhieu file local chua commit ma ban khong muon day len GitHub, dung tiep binh thuong nhung dung chay lenh reset/xoa hang loat.

## Buoc 2 - Kiem Tra GitHub Actions

Mo repo GitHub:

```text
https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions
```

Can thay workflow `Smart Health CI`.

Workflow nay se tu kiem tra:

- Backend `npm run check`.
- Backend workspace access smoke.
- Backend production readiness report.
- Web Admin Firebase build.
- Android debug Kotlin compile.
- Firmware ESP32-S3 normal va OTA build.

Neu workflow fail, mo job fail va copy log loi cho Codex sua tiep.

Neu muon deploy Web Admin truc tiep tren GitHub thay vi may local, vao:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Them cac secret:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
VITE_FIREBASE_API_KEY
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Trong do:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: toan bo noi dung service account JSON cua Firebase Admin/Hosting deploy.
- `VITE_FIREBASE_*`: lay trong Firebase Console -> Project settings -> Your apps -> Web app.
- `VITE_FIREBASE_MEASUREMENT_ID` co the de trong neu Firebase web app khong co Analytics, nhung tao secret rong tren GitHub khong duoc; neu khong co thi co the bo qua, workflow khong bat buoc.

Deploy bang GitHub:

```text
GitHub repo -> Actions -> Deploy Web Admin -> Run workflow
```

## Buoc 3 - Kiem Tra Render Backend Env

Vao Render service backend `smart-health-api-xj0a`, tab `Environment`.

Bat buoc nen co:

```env
AUTH_MODE=production
ALLOW_DEMO_AUTH=false
FIREBASE_AUTH_ENABLED=true
FIREBASE_PROJECT_ID=smart-health-stethoscope
FIREBASE_SERVICE_ACCOUNT_JSON=<paste toan bo service account JSON tren mot dong hoac nhieu dong deu duoc>
DATA_BACKEND=postgres
DATABASE_URL=<Supabase pooler connection string, khong dung direct IPv6>
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
PHI_ENCRYPTION_KEY=<64 ky tu hex>
RATE_LIMIT_PER_MINUTE=300
```

Tao `PHI_ENCRYPTION_KEY` bang PowerShell cu hon:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
-join ($bytes | ForEach-Object { $_.ToString("x2") })
```

Sau khi sua env, bam `Manual Deploy` tren Render.

Kiem tra backend:

```powershell
Invoke-RestMethod https://smart-health-api-xj0a.onrender.com/api/health
```

Ket qua can co `"ok": true`.

## Buoc 4 - Chay Backend Production Checks Tu May Local

Khong can Render Shell tra phi. Chay local voi env giong production neu muon kiem tra truoc.

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run check:production
```

Neu da dat du env local cho Firebase/Supabase/S3:

```powershell
npm.cmd run smoke:storage
npm.cmd run smoke:production-roles
```

`smoke:production-roles` can Firebase service account local:

```powershell
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
npm.cmd run smoke:production-roles
```

## Buoc 5 - Deploy Lai Web Admin Firebase Hosting

Dang nhap Firebase CLI neu chua dang nhap:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npx.cmd firebase-tools login
```

Build va deploy:

```powershell
npm.cmd run build:firebase
npx.cmd firebase-tools deploy --only hosting:admin --project smart-health-stethoscope
```

Mo:

```text
https://shcare-admin.web.app
```

Ky vong:

- Neu chua dang nhap: tu dong ve `/login`.
- Neu da dang nhap admin that: vao dashboard.
- Sidebar co `Hành động quản trị`.
- Dang nhap admin toan he thong se thay `Platform Admin Console`.
- Dang nhap admin benh vien se thay `Workspace Portal`/ten benh vien va khong thay menu platform-only.

Neu van thay giao dien cu, bam `Ctrl+F5` hoac mo incognito.

## Buoc 6 - Tao Tai Khoan Admin Ngay Tren Web Admin

Dang nhap bang admin toan he thong.

Vao:

```text
Hành động quản trị -> Tạo tài khoản admin
```

Chon mot trong hai kieu:

- `Admin toàn hệ thống`: quan ly platform, goi dich vu, workspace, setup he thong.
- `Admin bệnh viện`: chi quan ly du lieu cua mot benh vien/workspace duoc chon.

Nhap:

- Ho ten.
- Email.
- So dien thoai neu co.
- Mat khau tam thoi toi thieu 8 ky tu.
- Workspace neu tao admin benh vien.

Sau khi tao xong, nguoi dung can dang nhap bang email/mat khau do va doi mat khau neu can.

## Buoc 7 - Gmail SMTP Neu Muon Gui Email That

Trong Gmail:

1. Bat 2-Step Verification.
2. Tao App Password.
3. Dat Render env:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail cua ban>
SMTP_PASS=<app password>
SMTP_FROM=Smart Health <gmail cua ban>
```

Deploy lai Render.

Vao Web Admin:

```text
Cài đặt -> Thông báo/Outbound -> Test email
```

Neu chua cau hinh SMTP, nut test se bao thieu config, day la dung.

## Buoc 8 - SMS/Zalo

Ban khong can tra phi ngay. Ban co the de trong env nay neu chua demo SMS/Zalo that:

```env
OUTBOUND_WEBHOOK_URL=
OUTBOUND_WEBHOOK_SECRET=
```

Neu co webhook trung gian/provider:

```env
OUTBOUND_WEBHOOK_URL=https://your-webhook.example/smart-health/outbound
OUTBOUND_WEBHOOK_SECRET=<shared secret>
```

Backend se POST payload:

```json
{
  "channel": "sms",
  "to": "0900000000",
  "message": "Smart Health test",
  "templateId": "...",
  "metadata": {}
}
```

## Buoc 9 - Android Build De Cai Len Dien Thoai/Emulator

Debug cho emulator:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleDebug
```

Release tro ve backend Render:

```powershell
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://smart-health-api-xj0a.onrender.com
```

Neu release fail vi thieu signing, do la phan ky APK. Khi can phat hanh that, tao keystore rieng va khong commit len GitHub.

## Buoc 10 - ESP32-S3 Lan Dau

Lan dau van can cam day de nap firmware cloud-capable.

Kiem tra cong COM:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device list
```

Tam thoi them build flags local, khong commit secret:

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

Build/upload:

```powershell
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1 --target upload --upload-port COM6
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device monitor --port COM6 --baud 115200
```

Neu mat WiFi, ESP phat AP `SmartHealth-xxxxxx`. Ket noi AP do va vao:

```text
http://192.168.4.1
```

Trang local nay chi doi WiFi. Tat ca quan ly thiet bi/OTA/status van lam trong Web Admin chinh.

## Buoc 11 - Cloud OTA Khong Can Cung Mang

Build `.bin`:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
```

File:

```text
D:\Study\KLTN\smart-health-embedded\MSM261S4030H0\.pio\build\esp32-s3-devkitm-1\firmware.bin
```

Vao Web Admin:

```text
Storage -> bucket device-firmware -> upload firmware.bin
Devices -> chon device -> OTA -> chon file firmware -> gui lenh OTA
```

ESP chi can co Internet. May tinh/web admin khong can cung WiFi voi ESP.

## Buoc 12 - Smoke Cuoi Truoc Khi Bao Cao

Checklist:

- `https://smart-health-api-xj0a.onrender.com/api/health` ok.
- `https://shcare-admin.web.app` chua login thi ve login.
- Platform admin vao dung Platform Admin Console.
- Sidebar co `Hành động quản trị`.
- Tao duoc admin benh vien moi.
- Admin benh vien chi thay du lieu benh vien cua minh.
- Avatar/logo upload thanh cong.
- Settings save thanh cong.
- Storage upload/download thanh cong.
- ESP len online trong Devices.
- ESP gui heartbeat, WiFi RSSI/IP, firmware version.
- Web/app nghe realtime audio qua backend.
- OTA len firmware moi va ESP reboot thanh cong.
- Android app dang nhap/ket noi backend HTTPS duoc.

Neu co loi, copy dung man hinh/log loi va noi dang o buoc nao.
