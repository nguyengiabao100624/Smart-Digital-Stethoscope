# Smart Digital Stethoscope

[![Smart Health CI](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/smart-health-ci.yml/badge.svg)](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/smart-health-ci.yml)
[![Deploy Shcare Web Portal](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/deploy-shcare-web.yml/badge.svg)](https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope/actions/workflows/deploy-shcare-web.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | Tiếng Việt

Smart Digital Stethoscope, còn gọi là Smart Health, là nền tảng IoT y tế phục vụ đề tài tốt nghiệp về ống nghe điện tử kết nối. Dự án kết hợp firmware ESP32-S3, backend xác thực bằng Firebase, ứng dụng Android, cổng quản trị nền tảng và Shcare Workspace Portal cho bác sĩ/phòng khám/cơ sở y tế.

Dự án này là nguyên mẫu kỹ thuật và sản phẩm nghiên cứu. Đây chưa phải thiết bị y tế được chứng nhận. Kết quả AI/xử lý tín hiệu chỉ là thông tin hỗ trợ quyết định, không thay thế chẩn đoán của bác sĩ, quy trình y tế được cấp phép hoặc xử trí cấp cứu.

## Các Mặt Truy Cập Đang Chạy

| Mặt truy cập | URL | Mục đích |
| --- | --- | --- |
| Shcare Workspace Portal | <https://shcare.web.app> | Cổng làm việc cho bác sĩ, phòng khám và cơ sở y tế |
| Platform Admin Console | <https://shcare-admin.web.app> | Quản trị nền tảng/hệ thống |
| Backend API | <https://shcare-api-prod.onrender.com/api> | API Smart Health đang chạy trên Render |
| Firebase project | `smart-health-stethoscope` | Firebase Auth và Firebase Hosting targets |

## Trạng Thái Thực Tế

| Hạng mục | Trạng thái |
| --- | --- |
| Firebase Auth | Đã tích hợp thật cho Android, Web Admin và Shcare Portal. Backend xác minh Firebase ID token và lấy role/workspace/capability từ backend state hoặc custom claims đáng tin cậy. |
| Shcare Web Portal | Đang live trên Firebase Hosting. Public/auth pages và điều hướng portal cho bác sĩ/phòng khám đã có. Browser E2E đầy đủ cho mọi flow mutation vẫn cần bổ sung. |
| Platform Admin | Đang live trên Firebase Hosting, chỉ dành cho platform admin. Tài khoản bác sĩ/phòng khám được điều hướng sang Shcare Portal. |
| Backend API | Backend Node.js chạy local và Render. JSON mode dùng cho demo/dev; hướng production là PostgreSQL/repository. Chưa phải mọi runtime handler đều parity hoàn toàn với repository/Postgres. |
| Đăng ký bác sĩ và xác thực email | Web đăng ký dùng endpoint backend để tạo Firebase email-verification link và gửi qua provider email, không còn chỉ tin rằng client Firebase request nghĩa là email đã tới inbox. |
| Android app | Kotlin/Jetpack Compose build được, có flow Firebase role/session. Một số phần workspace/family management vẫn cần polish. |
| Firmware | Target production hiện tại là `smart-health-embedded/MSM261S4030H0` trên ESP32-S3. INMP441 đã rời scope sản phẩm hiện tại. |
| Audio/device pipeline | Đã có hướng cloud-first cho điều khiển/audio với WSS/HTTP và UDP fallback cho development. Physical board E2E, MQTT/cert, buffering và signed OTA vẫn cần hoàn thiện. |
| AI pipeline | Demo/scaffold. Chưa có pipeline inference/clinical validation production đầy đủ. |
| CI/CD | GitHub Actions kiểm tra backend, Web Admin, Shcare Web build, Android compile và ESP32-S3 firmware builds. Firebase Hosting deploy cần repository secrets. |

## Kiến Trúc

```text
Firmware ESP32-S3 MSM261
  -> telemetry thiết bị, command events, realtime/durable audio paths
  -> Smart Health backend trên Render
  -> Firebase Auth, hướng PostgreSQL, hướng object storage S3-compatible
  -> Android app, Shcare Portal, Platform Admin
  -> Firebase Hosting surfaces
```

Thiết kế production được tách theo các mặt:

- Control plane: commands, telemetry, heartbeat, device health và OTA events.
- Audio plane: WSS cho nghe realtime, HTTPS/object storage upload cho scan lưu trữ bền vững.
- Identity plane: Firebase Auth; backend tự enforce role, workspace và capability.
- Data plane: PostgreSQL và S3-compatible storage cho production; JSON mode giữ vai trò demo/development fallback.

## Cấu Trúc Repo

```text
.github/workflows/                  GitHub Actions CI và deploy workflows
docs/                               Trạng thái dự án, runbook, sơ đồ, tài liệu báo cáo/KLTN
smart-health-android/               Ứng dụng Android, Kotlin, Jetpack Compose
smart-health-embedded/web-monitor/  Backend Node.js, smoke tests, demo monitor, scripts production
smart-health-embedded/MSM261S4030H0/ Target firmware ESP32-S3 hiện tại
smart-health-web/                   Public site Shcare và portal cho bác sĩ/phòng khám
smart-health-admin/thiết kế giao diện/ Web admin nền tảng và tooling Firebase surface
```

Không đưa build output/cache/local secret lên Git: `dist/`, `dist-firebase/`, `.firebase/`, `.vite/`, `.tanstack/`, `.lovable/`, PlatformIO build output và các file env/credential local.

## Yêu Cầu Môi Trường

- Node.js 22+ và npm
- Bun cho `smart-health-web`
- JDK 17 và Android Studio cho Android build
- PlatformIO cho ESP32-S3 firmware build
- Firebase CLI cho Firebase Hosting deploy thủ công
- Quyền truy cập Firebase project và service account khi chạy tác vụ production/admin
- Render/Supabase/S3-compatible storage credentials khi chạy strict production checks

Tuyệt đối không commit secrets, Firebase service account JSON, `google-services.json`, `.env.production`, device secrets, mật khẩu Wi-Fi, PHI encryption key hoặc dữ liệu bệnh nhân.

## Backend

```powershell
cd smart-health-embedded\web-monitor
npm ci
npm run check
npm test
npm run smoke:workspace-access
npm start
```

Port local mặc định:

- HTTP/API/WebSocket backend: `http://localhost:3000`
- UDP audio fallback: `3001`

Các lệnh kiểm tra hữu ích:

```powershell
npm run smoke:repositories
npm run smoke:api-production
npm run smoke:production-roles
npm run smoke:public-deployment
npm run smoke:firebase-email
npm run check:production
```

`npm run check:production:strict` có thể báo blocked trong local shell nếu chưa load env production thật của Render/Supabase/S3/PHI/email provider. Đây không có nghĩa là phải tạo lại hạ tầng.

## Shcare Web Portal

```powershell
cd smart-health-web
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit --pretty false
bun run build:firebase
bun run dev
```

Firebase production build cần các env frontend:

```text
VITE_AUTH_MODE=production
VITE_SMART_HEALTH_API_BASE_URL=https://shcare-api-prod.onrender.com/api
VITE_PUBLIC_SITE_URL=https://shcare.web.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=smart-health-stethoscope.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=smart-health-stethoscope
VITE_FIREBASE_STORAGE_BUCKET=smart-health-stethoscope.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Deploy thủ công:

```powershell
cd smart-health-web
npx firebase-tools@latest deploy --only hosting:webapp --project smart-health-stethoscope --non-interactive
```

## Platform Admin Web

```powershell
cd "smart-health-admin\thiết kế giao diện"
npm ci
npm run lint
npm run build:firebase:admin
npm run dev
```

Deploy thủ công:

```powershell
cd "smart-health-admin\thiết kế giao diện"
npx firebase-tools@latest deploy --only hosting:admin --project smart-health-stethoscope --non-interactive
```

## Android App

```powershell
cd smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

File thật `app/google-services.json` được ignore có chủ đích. CI dùng `app/google-services.ci.json` như config placeholder chỉ để compile khi file thật không có trong repo.

## Firmware ESP32-S3

```powershell
cd smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-ota
```

Không hardcode Wi-Fi credentials, backend host, device ID, device secret hoặc OTA password trong source. Dùng build flags local hoặc provisioning flow cho thiết bị thật.

## GitHub Actions

| Workflow | Trigger | Nội dung |
| --- | --- | --- |
| `Smart Health CI` | push, pull request, manual | Backend check, workspace smoke, production readiness report, Web Admin build, Android compile, ESP32-S3 firmware builds |
| `Deploy Shcare Web Portal` | push build-only, manual deploy | Push chạy install/lint/build cho Shcare Web với placeholder env an toàn. Manual dispatch mới deploy `shcare.web.app`. |
| `Deploy Web Admin` | manual | Build và deploy `shcare-admin.web.app`. |

Deploy workflows cần GitHub repository secrets:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
VITE_FIREBASE_API_KEY
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID   # optional nếu không dùng Analytics runtime
```

## Bảo Mật Và Riêng Tư

- Xem [SECURITY.vi.md](SECURITY.vi.md) để báo cáo lỗ hổng bằng tiếng Việt hoặc [SECURITY.md](SECURITY.md) bằng tiếng Anh.
- Không mở public issue chứa token, service account, PHI, dữ liệu bệnh nhân hoặc chi tiết khai thác.
- Backend phải xác minh Firebase ID token và không được tin role/workspace do client gửi lên.
- Các hành động admin, device, storage, export và account phải giữ tenant isolation và auditability.
- Repo chỉ được chứa sample/demo data. Dữ liệu bệnh nhân thật phải nằm trong hệ thống production được phê duyệt, có mã hóa, retention, access control và rà soát pháp lý.

## Đóng Góp

Đọc [CONTRIBUTING.vi.md](CONTRIBUTING.vi.md) trước khi mở pull request. Baseline kiểm tra thường dùng:

```powershell
cd smart-health-embedded\web-monitor
npm run check
npm test
npm run smoke:workspace-access

cd ..\..\smart-health-web
bun run lint
bunx tsc --noEmit --pretty false
bun run build:firebase

cd ..\smart-health-android
.\gradlew.bat :app:compileDebugKotlin

cd ..\smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
```

Nếu chỉ sửa một phạm vi hẹp, chạy subset liên quan và ghi rõ check nào chưa chạy trong pull request.

## Giấy Phép

Dự án phát hành theo [MIT License](LICENSE). Bản dịch tham khảo tiếng Việt nằm ở [LICENSE.vi.md](LICENSE.vi.md); file `LICENSE` tiếng Anh là bản license chính thức.

Copyright (c) 2026 Nguyen Gia Bao and Nguyen Quang Danh.
