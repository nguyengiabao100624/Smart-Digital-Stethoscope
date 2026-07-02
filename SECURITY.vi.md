# Chính Sách Bảo Mật

[English](SECURITY.md) | Tiếng Việt

Smart Digital Stethoscope / Smart Health xử lý xác thực, phân quyền workspace, quản lý thiết bị, audio lâm sàng và dữ liệu kiểu hồ sơ sức khỏe. Vui lòng báo cáo vấn đề bảo mật riêng tư và có trách nhiệm.

## Phạm Vi Hỗ Trợ

| Thành phần | Được hỗ trợ |
| --- | --- |
| Branch `main` | Có |
| Backend/API behavior mới nhất đang deploy | Có |
| Portal `shcare.web.app` mới nhất đang deploy | Có |
| Admin console `shcare-admin.web.app` mới nhất đang deploy | Có |
| Source Android debug/release trong repo | Có |
| Source firmware ESP32-S3 MSM261 trong repo | Có |
| Branch cũ, fork, build output local-only | Không |

Dự án vẫn là nguyên mẫu kỹ thuật/KLTN, chưa phải thiết bị y tế được chứng nhận. Tuy vậy các vấn đề liên quan xác thực, phân quyền, quyền riêng tư, secrets, tenant isolation và device control vẫn được ưu tiên cao.

## Báo Cáo Lỗ Hổng

Không mở GitHub issue public cho vấn đề bảo mật.

Báo riêng qua email:

- Nguyen Gia Bao: `nguyengiabao100624@gmail.com`
- Nguyen Quang Danh: `danhnptho.word284@gmail.com`

Nếu repository đã bật GitHub private vulnerability reporting, bạn cũng có thể mở private security advisory trong tab Security.

## Nội Dung Cần Gửi

Vui lòng gửi:

- Thành phần bị ảnh hưởng: backend, Shcare Portal, Platform Admin, Android, firmware, CI/CD, Firebase, storage hoặc deployment
- Mô tả impact và mức độ nghiêm trọng dự kiến
- Các bước tái hiện chi tiết
- URL, route, endpoint, màn hình, workflow hoặc file bị ảnh hưởng
- Logs, screenshots, request IDs hoặc proof of concept nếu an toàn để chia sẻ
- Secret, token, account, clinical audio hoặc dữ liệu kiểu bệnh nhân có thể bị lộ hay không
- Cách liên hệ mong muốn để trao đổi tiếp

Không gửi dữ liệu bệnh nhân thật trừ khi maintainers yêu cầu một kênh truyền an toàn cụ thể.

## Mốc Phản Hồi

| Bước | Mục tiêu |
| --- | --- |
| Xác nhận đã nhận report | Trong 48 giờ |
| Triage ban đầu | Trong 7 ngày |
| Mitigation cho mức high/critical | Sớm nhất có thể, thường trong 30 ngày |
| Coordinated disclosure | Sau khi có fix, mitigation hoặc timeline đã thống nhất |

Đây là mục tiêu phản hồi, không phải cam kết pháp lý. Nếu lộ credential nghiêm trọng, cần rotate/revoke ngay trước khi xử lý triage bình thường.

## Các Nhóm Vấn Đề Ưu Tiên

Report có giá trị cao gồm:

- Bypass xác minh Firebase ID token
- Leo thang role, workspace, tenant hoặc capability
- Truy cập cross-workspace vào patients, scans, devices, staff, reports, storage, audit logs hoặc notifications
- Bypass hành động admin-only
- Lỗi email verification, password reset, session hoặc onboarding state
- Lộ PHI, export không an toàn, logging nhạy cảm hoặc thiếu boundary mã hóa
- Lộ Firebase service account, GitHub secret, Render env, database, storage, device secret hoặc OTA password
- Lỗi authorization trong device registration, command, telemetry, firmware update hoặc OTA
- Lỗi authorization/isolation ở WebSocket/audio stream
- CI/CD workflow làm lộ secrets hoặc deploy code không đáng tin cậy

## Ngoài Phạm Vi

Các mục sau thường ngoài phạm vi trừ khi chứng minh được impact bảo mật trực tiếp:

- Social engineering với maintainers hoặc users
- Denial-of-service test khi chưa có chấp thuận trước
- Tấn công vật lý vào thiết bị không thuộc quyền của bạn
- Spam, mass signup hoặc rate-limit-only issue không có impact account/data
- Report chỉ dựa trên generated build cũ ở local
- Scanner output không có reproduction hoạt động hoặc impact rõ ràng

## Safe Harbor

Chúng tôi sẽ không theo đuổi hành động chống lại nghiên cứu thiện chí nếu bạn:

- Chỉ test trên account, workspace, thiết bị và dữ liệu bạn sở hữu hoặc được phép test
- Không phá hủy dữ liệu, không cài persistence, không tống tiền, không lateral movement và không gây gián đoạn dịch vụ
- Không exfiltrate secrets hoặc PHI quá mức cần thiết để chứng minh impact
- Báo cáo riêng tư và cho maintainers thời gian hợp lý để phản hồi

## Lộ Secret

Nếu bạn cho rằng một secret bị lộ:

1. Ngừng dùng credential bị lộ.
2. Báo riêng file, commit, workflow hoặc URL nơi secret xuất hiện.
3. Rotate hoặc revoke credential nếu bạn có quyền.
4. Không paste secret đầy đủ vào public issue, pull request, screenshot hoặc chat log.

Các giá trị nhạy cảm gồm Firebase service account JSON, Firebase web config khi bị giới hạn, Render env vars, database URLs, S3/storage keys, PHI encryption keys, SMTP/Brevo keys, Android `google-services.json`, device secrets, Wi-Fi passwords và OTA passwords.
