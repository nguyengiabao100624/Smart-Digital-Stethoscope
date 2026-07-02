# Đóng Góp Cho Smart Digital Stethoscope

[English](CONTRIBUTING.md) | Tiếng Việt

Cảm ơn bạn muốn đóng góp cho Smart Digital Stethoscope / Smart Health. Repo này bao gồm firmware, backend, Android, web, deployment và tài liệu KLTN, nên mọi thay đổi cần rõ phạm vi, có kiểm chứng và cẩn thận với secrets/dữ liệu y tế.

## Phạm Vi Dự Án

Smart Health là nền tảng ống nghe điện tử kết nối gồm:

- Firmware ESP32-S3 MSM261 tại `smart-health-embedded/MSM261S4030H0`
- Backend Node.js tại `smart-health-embedded/web-monitor`
- Ứng dụng Android tại `smart-health-android`
- Shcare Workspace Portal tại `smart-health-web`
- Platform Admin Console tại `smart-health-admin/thiết kế giao diện`
- Trạng thái dự án và runbook tại `docs`

Đây là nguyên mẫu kỹ thuật, chưa phải thiết bị y tế được chứng nhận. Không trình bày output AI demo như chẩn đoán lâm sàng.

## Quy Trình Đóng Góp

1. Fork repo hoặc tạo branch từ `main`.
2. Tạo branch tập trung, ví dụ `fix/email-verification-resend` hoặc `docs/readme-refresh`.
3. Giữ thay đổi đúng phạm vi đang xử lý.
4. Không commit build output, cache local, secrets, service account hoặc dữ liệu bệnh nhân.
5. Chạy các lệnh kiểm tra liên quan.
6. Mở pull request với summary rõ, bằng chứng test, screenshot nếu sửa UI và giới hạn còn lại.

## Branch Và Commit

- Commit nhỏ, dễ review.
- Viết commit message dạng hành động, ví dụ `Fix portal email verification resend`.
- Tách source changes khỏi generated files.
- Nếu đổi behavior, cập nhật docs/runbook liên quan.
- Không trộn cleanup không liên quan vào feature/bug fix.

## Setup Local

Dùng Windows PowerShell trừ khi lệnh ghi rõ khác.

Backend:

```powershell
cd smart-health-embedded\web-monitor
npm ci
npm run check
npm test
npm run smoke:workspace-access
```

Shcare Web Portal:

```powershell
cd smart-health-web
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit --pretty false
bun run build:firebase
```

Platform Admin:

```powershell
cd "smart-health-admin\thiết kế giao diện"
npm ci
npm run lint
npm run build:firebase:admin
```

Android:

```powershell
cd smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

Firmware:

```powershell
cd smart-health-embedded\MSM261S4030H0
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-ota
```

## Kỳ Vọng Kiểm Chứng

Chạy check tương ứng với phần đã sửa:

| Phạm vi thay đổi | Kiểm tra tối thiểu |
| --- | --- |
| Backend route, auth, repository, email, storage | `npm run check`, `npm test`, smoke script liên quan |
| Portal UI hoặc auth flow | `bun run lint`, `bunx tsc --noEmit --pretty false`, `bun run build:firebase`, browser smoke nếu sửa UI |
| Platform Admin UI | `npm run lint`, `npm run build:firebase:admin`, browser smoke nếu sửa UI |
| Android | `.\gradlew.bat :app:compileDebugKotlin`; emulator smoke nếu sửa runtime/navigation |
| Firmware | PlatformIO build cho normal và OTA environments; hardware smoke nếu sửa provisioning/audio/OTA |
| CI/deploy workflow | Local syntax/diff checks và quan sát GitHub Actions sau push |
| Docs only | Kiểm tra link/path và UTF-8 tiếng Việt |

Nếu không chạy được check nào, ghi rõ lý do trong pull request.

## Quy Ước Code

Backend:

- Giữ ranh giới route, service, repository, auth và storage rõ ràng.
- Xác minh Firebase ID token ở server.
- Không tin role, workspace, organization hoặc capability do client gửi.
- Giữ compatibility với route cũ nếu Android/web hiện tại còn dùng.
- Trả lỗi rõ ràng; không giả vờ email/storage/push đã gửi thành công khi provider config bị thiếu.

Web:

- Giữ đúng surface: `shcare.web.app` cho bác sĩ/phòng khám và `shcare-admin.web.app` cho platform admin.
- Auth guard, role/surface redirect và backend API base URL phải explicit.
- Tránh hiện demo data trước khi real API state load.
- UI phải kiểm tra desktop và mobile width.

Android:

- Không nhồi business logic nặng vào Compose screens.
- Dùng API/service/ViewModel layers cho backend state.
- Giữ các trạng thái onboarding: pending, needs-info, rejected.
- Giữ tiếng Việt đúng UTF-8.

Firmware:

- Không hardcode Wi-Fi, backend, device hoặc OTA secrets.
- MSM261 ESP32-S3 là target firmware production hiện tại.
- Giữ cloud-first telemetry/audio và UDP fallback phục vụ development khi cần.

## Secrets, Riêng Tư Và Dữ Liệu Y Tế

Không bao giờ commit:

- Firebase service account JSON
- `google-services.json` thật
- `.env.production` hoặc provider secrets
- API keys, database URLs, S3 credentials, PHI encryption keys
- Mật khẩu Wi-Fi, device secrets, OTA passwords
- Hồ sơ bệnh nhân thật, audio lâm sàng, screenshot chứa PHI hoặc report export thật

Dùng fake/demo data cho test và tài liệu. Nếu lỡ commit secret, rotate ngay và báo riêng cho maintainers.

## Checklist Pull Request

Trước khi yêu cầu review:

- [ ] PR có problem statement và summary rõ.
- [ ] File thay đổi đúng phạm vi task.
- [ ] Tests/builds/smokes liên quan đã chạy và được liệt kê.
- [ ] UI changes có screenshot hoặc browser smoke notes.
- [ ] Không commit Firebase/Render/Supabase/S3/provider secrets.
- [ ] Không commit generated output và local caches.
- [ ] Docs/runbooks được cập nhật khi đổi behavior, command, env var hoặc deployment flow.
- [ ] Ghi rõ giới hạn còn lại.

## Báo Lỗi

Mở GitHub issue cho bug thông thường. Cần ghi:

- Môi trường và surface: backend, Android, firmware, Shcare Portal, Platform Admin hoặc CI
- Các bước tái hiện
- Kết quả mong đợi và kết quả thực tế
- Logs, screenshots hoặc request IDs liên quan
- Lỗi xảy ra local, CI hay live deployment

Với lỗi bảo mật, không mở public issue. Làm theo [SECURITY.vi.md](SECURITY.vi.md).
